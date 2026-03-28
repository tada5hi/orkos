/*
 * Copyright (c) 2025-2026.
 *  Author Peter Placzek (tada5hi)
 *  For the full copyright and license information,
 *  view the LICENSE file that was distributed with this source code.
 */

import type { IModule, ModuleDefinition, ModuleFactory, ModuleFactoryDefinition, ModuleOptions } from './types.ts';

/**
 * Create a typed module factory with default options.
 * Call the returned factory with partial overrides, or `false` to disable the module.
 *
 * @param definition - The module definition (inline or factory-based).
 * @returns A factory function that creates an {@link IModule} from optional overrides.
 *
 * @example
 * const Cache = defineModule<{ ttl: number }>({
 *     name: 'cache',
 *     defaults: { ttl: 3600 },
 *     async setup(options, container) { ... },
 * });
 * app.addModule(Cache());             // defaults
 * app.addModule(Cache({ ttl: 60 }));  // override
 * app.addModule(Cache(false));         // disabled
 */
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
