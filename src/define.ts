/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IContainer } from 'eldin';
import type { IModule } from './types.ts';

export type ModuleOptions = Record<string, unknown>;

export interface ModuleDefinition<T extends ModuleOptions> {
    name: string;
    dependsOn?: string[];
    defaults?: T;
    setup: (options: T, container: IContainer) => Promise<void>;
    teardown?: (options: T, container: IContainer) => Promise<void>;
    onReady?: (options: T, container: IContainer) => Promise<void>;
    onError?: (options: T, error: Error, container: IContainer) => Promise<void>;
}

export interface SimpleModuleDefinition {
    name: string;
    dependsOn?: string[];
    setup: (container: IContainer) => Promise<void>;
    teardown?: (container: IContainer) => Promise<void>;
    onReady?: (container: IContainer) => Promise<void>;
    onError?: (error: Error, container: IContainer) => Promise<void>;
}

export type ModuleFactory<T extends ModuleOptions> = (overrides?: Partial<T> | false) => IModule;

export type SimpleModuleFactory = (disable?: false) => IModule;

export function defineModule(
    definition: SimpleModuleDefinition,
): SimpleModuleFactory;

export function defineModule<T extends ModuleOptions>(
    definition: ModuleDefinition<T>,
): ModuleFactory<T>;

export function defineModule<T extends ModuleOptions>(
    definition: ModuleDefinition<T> | SimpleModuleDefinition,
): ModuleFactory<T> {
    const hasOptions = 'defaults' in definition || definition.setup.length > 1;

    return (overrides?: Partial<T> | false): IModule => {
        if (overrides === false) {
            return {
                name: definition.name,
                async setup() { /* empty */ },
            };
        }

        const options = hasOptions ?
            { ...(definition as ModuleDefinition<T>).defaults, ...overrides } as T :
            undefined;

        const { name, dependsOn } = definition;
        const s = definition.setup as (...args: any[]) => Promise<void>;
        const t = definition.teardown as ((...args: any[]) => Promise<void>) | undefined;
        const r = definition.onReady as ((...args: any[]) => Promise<void>) | undefined;
        const e = definition.onError as ((...args: any[]) => Promise<void>) | undefined;

        return {
            name,
            dependsOn,
            async setup(container: IContainer) {
                await (options ? s(options, container) : s(container));
            },
            ...(t && {
                async teardown(container: IContainer) {
                    await (options ? t(options, container) : t(container));
                },
            }),
            ...(r && {
                async onReady(container: IContainer) {
                    await (options ? r(options, container) : r(container));
                },
            }),
            ...(e && {
                async onError(error: Error, container: IContainer) {
                    await (options ? e(options, error, container) : e(error, container));
                },
            }),
        };
    };
}
