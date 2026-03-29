/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import { Container } from 'eldin';
import { ApplicationErrorCode, ModuleStatus } from './constants.ts';
import { ApplicationError } from './error.ts';
import { resolveExternalModules } from './resolve.ts';
import { satisfies } from './semver.ts';
import type {
    ApplicationContext,
    ExternalModuleReference,
    IApplication,
    IModule,
    ModuleDependency,
    ModuleInput,
    ModuleOptions,
    SetupOptions,
} from './types.ts';

export class Application implements IApplication {
    public readonly container: IContainer;

    protected modules: Map<string, IModule>;

    protected modulesOrdered: IModule[];

    protected modulesPending: ExternalModuleReference[];

    protected modulesExternal: ExternalModuleReference[];

    protected moduleStatus: Map<string, ModuleStatus>;

    protected autoInstall: boolean;

    protected maxResolveDepth: number;

    constructor(context?: ApplicationContext) {
        this.container = context?.container ?? new Container();
        this.modules = new Map();
        this.modulesOrdered = [];
        this.modulesPending = [];
        this.modulesExternal = [];
        this.moduleStatus = new Map();
        this.autoInstall = context?.autoInstall ?? false;
        this.maxResolveDepth = context?.maxResolveDepth ?? 10;

        if (context?.modules) {
            this.addModules(context.modules);
        }
    }

    addModule(module: ModuleInput): void {
        if (typeof module === 'string') {
            this.modulesPending.push({
                name: module,
                source: 'explicit',
            });
            return;
        }

        if (Array.isArray(module)) {
            this.modulesPending.push({
                name: module[0],
                options: module[1] as ModuleOptions,
                source: 'explicit',
            });
            return;
        }

        this.modules.set(module.name, module);
        this.moduleStatus.set(module.name, ModuleStatus.Pending);
    }

    addModules(modules: ModuleInput[]): void {
        modules.forEach((module) => this.addModule(module));
    }

    getModuleStatus(name: string): ModuleStatus {
        const status = this.moduleStatus.get(name);
        if (status === undefined) {
            throw new ApplicationError({
                message: `Module "${name}" is not registered`,
                code: ApplicationErrorCode.MODULE_NOT_REGISTERED,
            });
        }

        return status;
    }

    getStatus(): Map<string, ModuleStatus> {
        return new Map(this.moduleStatus);
    }

    async setup(options?: SetupOptions): Promise<void> {
        const resolveCache = options?.resolveCache ?? true;

        if (this.modulesPending.length > 0 || !resolveCache) {
            await this.resolveExternals(resolveCache);
        }

        this.modulesOrdered = this.resolveOrder();

        for (const module of this.modulesOrdered) {
            this.moduleStatus.set(module.name, ModuleStatus.SettingUp);
            try {
                await module.setup(this.container);
                this.moduleStatus.set(module.name, ModuleStatus.Ready);
            } catch (error) {
                this.moduleStatus.set(module.name, ModuleStatus.Failed);

                try {
                    await module.onError?.(error as Error, this.container);
                } catch {
                    // must not mask the original error
                }

                await this.teardownModules(this.modulesOrdered);
                throw error;
            }
        }

        for (const module of this.modulesOrdered) {
            await module.onReady?.(this.container);
        }
    }

    async teardown(): Promise<void> {
        await this.teardownModules(this.modulesOrdered);
    }

    protected async resolveExternals(useCache: boolean): Promise<void> {
        let pending: ExternalModuleReference[];

        if (!useCache) {
            // Remove previously resolved externals so they can be re-resolved
            for (const ref of this.modulesExternal) {
                const name = ref.expectedName ?? ref.name;
                this.modules.delete(name);
                this.moduleStatus.delete(name);
            }
            pending = [...this.modulesExternal, ...this.modulesPending];
        } else {
            pending = [...this.modulesPending];
        }

        if (pending.length === 0) {
            return;
        }

        const resolved = await resolveExternalModules({
            pending,
            registered: this.modules,
            autoInstall: this.autoInstall,
            maxDepth: this.maxResolveDepth,
        });

        for (const module of resolved) {
            this.moduleStatus.set(module.name, ModuleStatus.Pending);

            // Track resolved module for potential re-resolution
            if (!this.modulesExternal.some((e) => (e.expectedName ?? e.name) === module.name)) {
                const ref = pending.find((r) => (r.expectedName ?? r.name) === module.name) ??
                    { name: module.name, source: 'dependency' as const };
                this.modulesExternal.push(ref);
            }
        }

        this.modulesPending = [];
    }

    protected async teardownModules(modules: IModule[]): Promise<void> {
        for (const module of [...modules].reverse()) {
            if (this.moduleStatus.get(module.name) !== ModuleStatus.Ready) {
                continue;
            }

            this.moduleStatus.set(module.name, ModuleStatus.TearingDown);
            try {
                await module.teardown?.(this.container);
                this.moduleStatus.set(module.name, ModuleStatus.TornDown);
            } catch {
                this.moduleStatus.set(module.name, ModuleStatus.TornDown);
                // individual teardown failure must not prevent remaining modules from tearing down
            }
        }
    }

    protected resolveOrder(): IModule[] {
        const names = [...this.modules.keys()];
        const registered = new Set(names);
        const inDegree = new Map<string, number>();
        const adjacency = new Map<string, string[]>();

        names.forEach((name) => {
            inDegree.set(name, 0);
            adjacency.set(name, []);
        });

        names.forEach((name) => {
            const module = this.modules.get(name)!;
            if (!module.dependencies) {
                return;
            }

            module.dependencies.forEach((raw) => {
                const dep = this.normalizeDependency(raw);

                if (!registered.has(dep.name)) {
                    if (dep.optional) {
                        return;
                    }

                    throw new ApplicationError({
                        message: `Module "${name}" depends on "${dep.name}", which is not registered`,
                        code: ApplicationErrorCode.MODULE_NOT_FOUND,
                    });
                }

                this.validateDependencyVersion(module.name, dep);

                adjacency.get(dep.name)!.push(name);
                inDegree.set(name, inDegree.get(name)! + 1);
            });
        });

        const queue: string[] = names.filter((name) => inDegree.get(name) === 0);

        const sorted: IModule[] = [];
        while (queue.length > 0) {
            const current = queue.shift()!;
            sorted.push(this.modules.get(current)!);

            const neighbors = adjacency.get(current)!;
            for (const neighbor of neighbors) {
                const newDegree = inDegree.get(neighbor)! - 1;
                inDegree.set(neighbor, newDegree);

                if (newDegree === 0) {
                    queue.push(neighbor);
                }
            }
        }

        if (sorted.length !== this.modules.size) {
            const remaining = names
                .filter((name) => !sorted.some((m) => m.name === name));

            throw new ApplicationError({
                message: `Circular module dependency detected involving: ${remaining.join(', ')}`,
                code: ApplicationErrorCode.CIRCULAR_DEPENDENCY,
            });
        }

        return sorted;
    }

    protected normalizeDependency(dep: string | ModuleDependency): ModuleDependency {
        if (typeof dep === 'string') {
            return { name: dep };
        }

        return dep;
    }

    protected validateDependencyVersion(moduleName: string, dep: ModuleDependency): void {
        if (!dep.version) {
            return;
        }

        const target = this.modules.get(dep.name);
        if (!target) {
            return;
        }

        if (!target.version) {
            throw new ApplicationError({
                message: `Module "${moduleName}" requires "${dep.name}" version ${dep.version}, but "${dep.name}" does not declare a version`,
                code: ApplicationErrorCode.VERSION_MISMATCH,
            });
        }

        if (!satisfies(target.version, dep.version)) {
            throw new ApplicationError({
                message: `Module "${moduleName}" requires "${dep.name}" version ${dep.version}, but version ${target.version} is registered`,
                code: ApplicationErrorCode.VERSION_MISMATCH,
            });
        }
    }
}
