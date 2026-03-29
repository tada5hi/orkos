/*
 * Copyright (c) 2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import { installPackage } from '@antfu/install-pkg';
import { ApplicationErrorCode } from './constants.ts';
import { ApplicationError } from './error.ts';
import type {
    ExternalModuleReference,
    IModule,
    ModuleDependency,
    ResolveExternalModulesContext,
} from './types.ts';

/**
 * Resolve external module references by dynamically importing npm packages.
 * Supports recursive resolution of unresolved dependencies.
 * Mutates the `registered` map, adding resolved modules as they are discovered.
 *
 * @param context - The resolution context.
 * @returns The list of newly resolved modules.
 */
export async function resolveExternalModules(
    context: ResolveExternalModulesContext,
): Promise<IModule[]> {
    const {
        pending,
        registered,
        autoInstall = false,
        maxDepth = 10,
        importFn = defaultImportFn,
        installFn = defaultInstallFn,
    } = context;

    const resolved: IModule[] = [];
    const attempted = new Set<string>();

    let currentPending = [...pending];
    let depth = 0;

    while (currentPending.length > 0) {
        if (depth >= maxDepth) {
            throw new ApplicationError({
                message: `Maximum external module resolution depth (${maxDepth}) exceeded. Check for circular external dependencies.`,
                code: ApplicationErrorCode.RESOLUTION_DEPTH_EXCEEDED,
            });
        }

        const nextPending: ExternalModuleReference[] = [];

        for (const ref of currentPending) {
            const expectedName = ref.expectedName ?? ref.name;
            if (registered.has(expectedName) || attempted.has(ref.name)) {
                continue;
            }

            attempted.add(ref.name);

            const module = await resolveModule(ref, { autoInstall, importFn, installFn });
            registered.set(module.name, module);
            resolved.push(module);

            // Scan newly resolved module's dependencies for further unresolved references
            if (module.dependencies) {
                for (const raw of module.dependencies) {
                    const dep = normalizeDependency(raw);
                    const packageName = dep.package || dep.name;

                    if (!registered.has(dep.name) && !attempted.has(packageName)) {
                        nextPending.push({
                            name: packageName,
                            expectedName: dep.package ? dep.name : undefined,
                            source: 'dependency',
                            referencedBy: module.name,
                        });
                    }
                }
            }
        }

        currentPending = nextPending;
        depth++;
    }

    return resolved;
}

async function resolveModule(
    ref: ExternalModuleReference,
    options: {
        autoInstall: boolean;
        importFn: (name: string) => Promise<unknown>;
        installFn: (name: string) => Promise<void>;
    },
): Promise<IModule> {
    let imported: unknown;

    try {
        imported = await options.importFn(ref.name);
    } catch {
        if (options.autoInstall) {
            await tryInstallPackage(ref.name, options.installFn);
            try {
                imported = await options.importFn(ref.name);
            } catch {
                throw createNotFoundError(ref);
            }
        } else {
            throw createNotFoundError(ref);
        }
    }

    const moduleExport = extractDefaultExport(imported, ref.name);
    return instantiateModule(moduleExport, ref);
}

function extractDefaultExport(imported: unknown, packageName: string): unknown {
    if (
        typeof imported === 'object' &&
        imported !== null &&
        'default' in imported
    ) {
        return (imported as Record<string, unknown>).default;
    }

    throw new ApplicationError({
        message: `Package "${packageName}" has no default export. Expected a ModuleFactory or IModule.`,
        code: ApplicationErrorCode.INVALID_MODULE_EXPORT,
    });
}

function instantiateModule(moduleExport: unknown, ref: ExternalModuleReference): IModule {
    // ModuleFactory — call with provided options
    if (typeof moduleExport === 'function') {
        const result = ref.options ?
            moduleExport(ref.options) :
            moduleExport();

        if (!isModuleLike(result)) {
            throw new ApplicationError({
                message: `Package "${ref.name}" factory did not return a valid IModule. Expected an object with "name" and "setup".`,
                code: ApplicationErrorCode.INVALID_MODULE_EXPORT,
            });
        }

        validateModuleName(result, ref);
        return result;
    }

    // IModule — use directly
    if (isModuleLike(moduleExport)) {
        if (ref.options) {
            throw new ApplicationError({
                message: `Options provided for "${ref.name}" but its default export is not a ModuleFactory.`,
                code: ApplicationErrorCode.OPTIONS_NOT_SUPPORTED,
            });
        }

        validateModuleName(moduleExport, ref);
        return moduleExport;
    }

    throw new ApplicationError({
        message: `Package "${ref.name}" default export is not a valid ModuleFactory or IModule. Expected a function or an object with "name" and "setup".`,
        code: ApplicationErrorCode.INVALID_MODULE_EXPORT,
    });
}

function validateModuleName(module: IModule, ref: ExternalModuleReference): void {
    const expected = ref.expectedName ?? ref.name;
    if (module.name !== expected) {
        throw new ApplicationError({
            message: `Package "${ref.name}" exported module named "${module.name}", expected "${expected}"`,
            code: ApplicationErrorCode.INVALID_MODULE_EXPORT,
        });
    }
}

function isModuleLike(value: unknown): value is IModule {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        typeof (value as Record<string, unknown>).name === 'string' &&
        'setup' in value &&
        typeof (value as Record<string, unknown>).setup === 'function'
    );
}

async function tryInstallPackage(
    name: string,
    installFn: (name: string) => Promise<void>,
): Promise<void> {
    try {
        await installFn(name);
    } catch (error) {
        throw new ApplicationError({
            message: `Failed to install "${name}": ${error instanceof Error ? error.message : String(error)}`,
            code: ApplicationErrorCode.MODULE_INSTALL_FAILED,
        });
    }
}

function createNotFoundError(ref: ExternalModuleReference): ApplicationError {
    const base = `Module "${ref.name}" could not be resolved.`;
    const hint = `Run: npm install ${ref.name}`;
    const referencedBy = ref.referencedBy ?
        ` Required by "${ref.referencedBy}".` :
        '';

    return new ApplicationError({
        message: `${base}${referencedBy} ${hint}`,
        code: ApplicationErrorCode.MODULE_NOT_FOUND,
    });
}

function normalizeDependency(dep: string | ModuleDependency): ModuleDependency {
    if (typeof dep === 'string') {
        return { name: dep };
    }
    return dep;
}

function defaultImportFn(name: string): Promise<unknown> {
    return import(name);
}

async function defaultInstallFn(name: string): Promise<void> {
    await installPackage(name);
}
