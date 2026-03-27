/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type {IContainer} from 'eldin';
import type {ModuleStatus} from './constants.ts';

export interface IModule {
    readonly name: string;
    readonly dependsOn?: string[];

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
