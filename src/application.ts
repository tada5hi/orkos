/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import { Container } from 'eldin';
import { ApplicationError } from './error.ts';
import type { IApplication, IModule } from './types.ts';
import {ModuleStatus} from './constants.ts';

export class Application implements IApplication {
    public readonly container: IContainer;

    protected modules: Map<string, IModule>;

    protected modulesOrdered: IModule[];

    protected moduleStatus: Map<string, ModuleStatus>;

    constructor(modules: IModule[] = []) {
        this.container = new Container();
        this.modules = new Map();
        this.modulesOrdered = [];
        this.moduleStatus = new Map();

        this.addModules(modules);
    }

    addModule(module: IModule): void {
        this.modules.set(module.name, module);
        this.moduleStatus.set(module.name, ModuleStatus.Pending);
    }

    addModules(modules: IModule[]): void {
        modules.forEach((module) => this.addModule(module));
    }

    getModuleStatus(name: string): ModuleStatus {
        const status = this.moduleStatus.get(name);
        if (status === undefined) {
            throw new ApplicationError(`Module "${name}" is not registered`);
        }

        return status;
    }

    getStatus(): Map<string, ModuleStatus> {
        return new Map(this.moduleStatus);
    }

    async setup(): Promise<void> {
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
            if (!module.dependsOn) {
                return;
            }

            module.dependsOn.forEach((dep) => {
                if (!registered.has(dep)) {
                    return;
                }

                adjacency.get(dep)!.push(name);
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

            throw new ApplicationError(
                `Circular module dependency detected involving: ${remaining.join(', ')}`,
            );
        }

        return sorted;
    }
}
