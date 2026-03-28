/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IModule, ModuleDefinition, ModuleFactory, ModuleFactoryDefinition, ModuleOptions } from './types.ts';

export function defineModule<T extends ModuleOptions>(
    definition: ModuleDefinition<T>,
): ModuleFactory<T>;

export function defineModule<T extends ModuleOptions>(
    definition: ModuleFactoryDefinition<T>,
): ModuleFactory<T>;

export function defineModule<T extends ModuleOptions>(
    definition: ModuleDefinition<T> | ModuleFactoryDefinition<T>,
): ModuleFactory<T> {
    return (overrides?: Partial<T> | false): IModule => {
        if (overrides === false) {
            const name = 'factory' in definition ?
                'disabled' :
                definition.name;

            return {
                name,
                async setup() { /* empty */ },
            };
        }

        const options = { ...definition.defaults, ...overrides } as T;

        if ('factory' in definition) {
            return definition.factory(options);
        }

        return {
            name: definition.name,
            dependencies: definition.dependencies,
            async setup(container) {
                await definition.setup(options, container);
            },
            ...(definition.teardown && {
                async teardown(container) {
                    await definition.teardown!(options, container);
                },
            }),
            ...(definition.onReady && {
                async onReady(container) {
                    await definition.onReady!(options, container);
                },
            }),
            ...(definition.onError && {
                async onError(error, container) {
                    await definition.onError!(options, error, container);
                },
            }),
        };
    };
}
