/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { ModuleStatus } from './constants.ts';

/**
 * Describes a dependency on another module with optional version and optionality constraints.
 */
export interface ModuleDependency {
    /**
     * Name of the required module.
     */
    name: string;
    /**
     * Semver range the dependency must satisfy (e.g. `>=2.0.0`, `^1.3.0`).
     */
    version?: string;
    /**
     * When `true`, the dependency is silently skipped if not registered.
     */
    optional?: boolean;
    /**
     * npm package name for auto-resolution, if different from the module name.
     */
    package?: string;
}

/**
 * A self-contained unit of application functionality with lifecycle hooks.
 * Modules are set up in dependency order and torn down in reverse.
 */
export interface IModule {
    /**
     * Unique identifier used for dependency references.
     */
    readonly name: string;
    /**
     * Semver version string, validated against dependent version constraints.
     */
    readonly version?: string;
    /**
     * Modules that must be set up before this one.
     */
    readonly dependencies?: (string | ModuleDependency)[];

    /**
     * Called during startup with the shared DI container.
     *
     * @param container - The shared eldin DI container.
     */
    setup(container: IContainer): Promise<void>;

    /**
     * Called during shutdown in reverse dependency order.
     *
     * @param container - The shared eldin DI container.
     */
    teardown?(container: IContainer): Promise<void>;

    /**
     * Called after all modules have been set up successfully.
     *
     * @experimental May be renamed to `handleReady` in a future version.
     * @param container - The shared eldin DI container.
     */
    onReady?(container: IContainer): Promise<void>;

    /**
     * Called when this module's {@link setup} throws. The error is re-thrown afterwards.
     *
     * @experimental May be renamed to `handleError` in a future version.
     * @param error - The error thrown during setup.
     * @param container - The shared eldin DI container.
     */
    onError?(error: Error, container: IContainer): Promise<void>;
}

/**
 * Accepted input types for module registration.
 * - `IModule` — an already-instantiated module
 * - `string` — an npm package name to resolve via dynamic import
 * - `[string, ModuleOptions]` — an npm package name with options for the module factory
 */
export type ModuleInput = IModule | string | [string, ModuleOptions];

/**
 * Options passed to {@link Application.setup}.
 */
export interface SetupOptions {
    /**
     * When `false`, forces re-resolution of external modules even if previously resolved.
     * @default true
     */
    resolveCache?: boolean;
}

/**
 * Configuration for the {@link Application} constructor.
 */
export interface ApplicationContext {
    /**
     * Modules to register on construction.
     */
    modules?: ModuleInput[];
    /**
     * When `true`, automatically install missing npm packages during resolution.
     * @default false
     */
    autoInstall?: boolean;
    /**
     * A pre-configured DI container. If omitted, a new `Container` is created.
     */
    container?: IContainer;
    /**
     * Maximum depth for recursive external module resolution.
     * @default 10
     */
    maxResolveDepth?: number;
}

/**
 * Orchestrates module registration, dependency-ordered setup, and reverse-order teardown.
 */
export interface IApplication {
    /**
     * The shared eldin DI container passed to every module.
     */
    readonly container: IContainer;

    /**
     * Register a single module.
     *
     * @param module - The module to register.
     */
    addModule(module: ModuleInput): void;
    /**
     * Register multiple modules at once.
     *
     * @param modules - The modules to register.
     */
    addModules(modules: ModuleInput[]): void;

    /**
     * Get the current lifecycle status of a registered module.
     *
     * @param name - The module name.
     * @returns The current status of the module.
     */
    getModuleStatus(name: string): ModuleStatus;
    /**
     * Get a snapshot of all module statuses.
     *
     * @returns A map of module names to their current status.
     */
    getStatus(): Map<string, ModuleStatus>;

    /**
     * Resolve dependency order, validate version constraints, and set up all modules.
     *
     * @param options - Optional setup configuration.
     */
    setup(options?: SetupOptions): Promise<void>;
    /**
     * Tear down all ready modules in reverse dependency order.
     */
    teardown(): Promise<void>;
}

export type ModuleOptions = Record<string, unknown>;

/**
 * Inline module definition used with {@link defineModule}. Lifecycle methods receive
 * the merged options object as their first argument.
 */
export interface ModuleDefinition<T extends ModuleOptions> {
    name: string;
    dependencies?: (string | ModuleDependency)[];
    defaults?: T;
    setup: (options: T, container: IContainer) => Promise<void>;
    teardown?: (options: T, container: IContainer) => Promise<void>;
    /**
     * @experimental May be renamed to `handleReady` in a future version.
     */
    onReady?: (options: T, container: IContainer) => Promise<void>;
    /**
     * @experimental May be renamed to `handleError` in a future version.
     */
    onError?: (options: T, error: Error, container: IContainer) => Promise<void>;
}

/**
 * Factory-based module definition used with {@link defineModule}. Wraps an existing
 * {@link IModule} implementation with typed options and defaults.
 */
export interface ModuleFactoryDefinition<T extends ModuleOptions> {
    defaults?: T;
    factory: (options: T) => IModule;
}

export type ModuleFactory<T extends ModuleOptions> = (overrides?: Partial<T> | false) => IModule;

/**
 * Internal representation of an external module reference awaiting resolution.
 */
export interface ExternalModuleReference {
    /**
     * The npm package name to resolve.
     */
    name: string;
    /**
     * The expected module name, if different from the package name.
     * Used when a dependency declares a `package` field that differs from its `name`.
     */
    expectedName?: string;
    /**
     * Options to pass to the module factory, if applicable.
     */
    options?: ModuleOptions;
    /**
     * Whether this reference was explicitly added or discovered from a dependency.
     */
    source: 'explicit' | 'dependency';
    /**
     * The module name that triggered this reference, if source is 'dependency'.
     */
    referencedBy?: string;
    /**
     * When `true`, resolution failure is silently skipped instead of throwing.
     */
    optional?: boolean;
}

/**
 * Context for the external module resolver.
 */
export interface ResolveExternalModulesContext {
    /**
     * External module references to resolve.
     */
    pending: ExternalModuleReference[];
    /**
     * The current module registry. Mutated during resolution as modules are added.
     */
    registered: Map<string, IModule>;
    /**
     * When `true`, automatically install missing npm packages.
     */
    autoInstall?: boolean;
    /**
     * Maximum depth for recursive resolution.
     */
    maxDepth?: number;
    /**
     * Custom import function for testing.
     */
    importFn?: (name: string) => Promise<unknown>;
    /**
     * Custom install function for testing.
     */
    installFn?: (name: string) => Promise<void>;
}
