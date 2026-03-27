/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { ModuleStatus } from './constants.ts';

export interface ModuleDependency {
    name: string;
    version?: string;
    optional?: boolean;
}

export interface IModule {
    readonly name: string;
    readonly version?: string;
    readonly dependencies?: (string | ModuleDependency)[];

    setup(container: IContainer): Promise<void>;

    teardown?(container: IContainer): Promise<void>;

    onReady?(container: IContainer): Promise<void>;

    onError?(error: Error, container: IContainer): Promise<void>;
}

export interface IApplication {
    readonly container: IContainer;

    addModule(module: IModule): void;
    addModules(modules: IModule[]): void;

    getModuleStatus(name: string): ModuleStatus;
    getStatus(): Map<string, ModuleStatus>;

    setup(): Promise<void>;
    teardown(): Promise<void>;
}

export type ModuleOptions = Record<string, unknown>;

export interface ModuleDefinition<T extends ModuleOptions> {
    name: string;
    dependencies?: (string | ModuleDependency)[];
    defaults?: T;
    setup: (options: T, container: IContainer) => Promise<void>;
    teardown?: (options: T, container: IContainer) => Promise<void>;
    onReady?: (options: T, container: IContainer) => Promise<void>;
    onError?: (options: T, error: Error, container: IContainer) => Promise<void>;
}

export interface ModuleFactoryDefinition<T extends ModuleOptions> {
    defaults?: T;
    factory: (options: T) => IModule;
}

export type ModuleFactory<T extends ModuleOptions> = (overrides?: Partial<T> | false) => IModule;
