import { describe, expect, it, vi } from 'vitest';
import { Container } from 'eldin';
import { Application, ApplicationError, ApplicationErrorCode } from '../../src';
import { resolveExternalModules } from '../../src/resolve.ts';
import type { IModule } from '../../src';

function createMockModule(name: string, deps?: IModule['dependencies']): IModule {
    return {
        name,
        dependencies: deps,
        async setup() { /* noop */ },
    };
}

function createMockImportFn(packages: Record<string, unknown>) {
    return async (name: string) => {
        if (name in packages) {
            return packages[name];
        }
        throw new Error(`Cannot find module '${name}'`);
    };
}

describe('resolveExternalModules', () => {
    describe('basic resolution', () => {
        it('should resolve a package with a factory default export', async () => {
            const module = createMockModule('redis');
            const importFn = createMockImportFn({
                redis: { default: () => module },
            });

            const registered = new Map<string, IModule>();
            const resolved = await resolveExternalModules({
                pending: [{ name: 'redis', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(1);
            expect(resolved[0].name).toBe('redis');
            expect(registered.has('redis')).toBe(true);
        });

        it('should resolve a package with an IModule default export', async () => {
            const module = createMockModule('orkos-redis');
            const importFn = createMockImportFn({
                'orkos-redis': { default: module },
            });

            const registered = new Map<string, IModule>();
            const resolved = await resolveExternalModules({
                pending: [{ name: 'orkos-redis', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(1);
            expect(resolved[0].name).toBe('orkos-redis');
        });

        it('should pass options to a factory default export', async () => {
            const factory = vi.fn(() => createMockModule('redis'));
            const importFn = createMockImportFn({
                redis: { default: factory },
            });

            await resolveExternalModules({
                pending: [{ name: 'redis', options: { host: '10.0.0.1' }, source: 'explicit' }],
                registered: new Map(),
                importFn,
            });

            expect(factory).toHaveBeenCalledWith({ host: '10.0.0.1' });
        });

        it('should skip already-registered modules', async () => {
            const importFn = vi.fn();
            const registered = new Map<string, IModule>();
            registered.set('redis', createMockModule('redis'));

            const resolved = await resolveExternalModules({
                pending: [{ name: 'redis', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(0);
            expect(importFn).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should throw MODULE_NOT_FOUND when import fails', async () => {
            expect.assertions(3);
            const importFn = createMockImportFn({});

            try {
                await resolveExternalModules({
                    pending: [{ name: 'nonexistent', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.MODULE_NOT_FOUND);
                expect((error as ApplicationError).message).toContain('nonexistent');
                expect((error as ApplicationError).message).toContain('npm install');
            }
        });

        it('should include referencedBy in MODULE_NOT_FOUND error', async () => {
            expect.assertions(1);
            const importFn = createMockImportFn({});

            try {
                await resolveExternalModules({
                    pending: [{ name: 'missing', source: 'dependency', referencedBy: 'auth' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).message).toContain('auth');
            }
        });

        it('should throw INVALID_MODULE_EXPORT when no default export', async () => {
            expect.assertions(2);
            const importFn = createMockImportFn({
                'bad-package': { namedExport: 'hello' },
            });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'bad-package', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.INVALID_MODULE_EXPORT);
                expect((error as ApplicationError).message).toContain('no default export');
            }
        });

        it('should throw INVALID_MODULE_EXPORT when default export is invalid', async () => {
            expect.assertions(2);
            const importFn = createMockImportFn({
                'bad-package': { default: 42 },
            });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'bad-package', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.INVALID_MODULE_EXPORT);
                expect((error as ApplicationError).message).toContain('not a valid');
            }
        });

        it('should throw OPTIONS_NOT_SUPPORTED when options passed to IModule export', async () => {
            expect.assertions(1);
            const importFn = createMockImportFn({
                redis: { default: createMockModule('redis') },
            });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'redis', options: { host: 'localhost' }, source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.OPTIONS_NOT_SUPPORTED);
            }
        });

        it('should throw INVALID_MODULE_EXPORT when module name does not match package name', async () => {
            expect.assertions(2);
            const importFn = createMockImportFn({
                'orkos-redis': { default: createMockModule('redis') },
            });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'orkos-redis', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.INVALID_MODULE_EXPORT);
                expect((error as ApplicationError).message).toContain('orkos-redis');
            }
        });

        it('should throw INVALID_MODULE_EXPORT when factory returns invalid result', async () => {
            expect.assertions(2);
            const importFn = createMockImportFn({
                broken: { default: () => ({ notAModule: true }) },
            });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'broken', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.INVALID_MODULE_EXPORT);
                expect((error as ApplicationError).message).toContain('factory did not return');
            }
        });

        it('should validate name on factory return value', async () => {
            expect.assertions(2);
            const importFn = createMockImportFn({
                'pkg-a': { default: () => createMockModule('different-name') },
            });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'pkg-a', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.INVALID_MODULE_EXPORT);
                expect((error as ApplicationError).message).toContain('different-name');
            }
        });
    });

    describe('recursive resolution', () => {
        it('should resolve dependencies of resolved modules', async () => {
            const moduleA = createMockModule('a', ['b']);
            const moduleB = createMockModule('b');
            const importFn = createMockImportFn({
                a: { default: moduleA },
                b: { default: moduleB },
            });

            const registered = new Map<string, IModule>();
            const resolved = await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(2);
            expect(registered.has('a')).toBe(true);
            expect(registered.has('b')).toBe(true);
        });

        it('should resolve deep recursive chains', async () => {
            const moduleA = createMockModule('a', ['b']);
            const moduleB = createMockModule('b', ['c']);
            const moduleC = createMockModule('c');
            const importFn = createMockImportFn({
                a: { default: moduleA },
                b: { default: moduleB },
                c: { default: moduleC },
            });

            const registered = new Map<string, IModule>();
            const resolved = await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(3);
            expect(registered.has('c')).toBe(true);
        });

        it('should not re-resolve already registered dependencies', async () => {
            const moduleA = createMockModule('a', ['b']);
            const moduleB = createMockModule('b');
            const importFn = vi.fn(createMockImportFn({
                a: { default: moduleA },
            }));

            const registered = new Map<string, IModule>();
            registered.set('b', moduleB);

            await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(importFn).toHaveBeenCalledTimes(1);
            expect(importFn).toHaveBeenCalledWith('a');
        });

        it('should use package field from ModuleDependency for resolution', async () => {
            const moduleA = createMockModule('a', [{ name: 'b', package: '@scope/b' }]);
            const moduleB = createMockModule('b');
            const importFn = createMockImportFn({
                a: { default: moduleA },
                '@scope/b': { default: moduleB },
            });

            const registered = new Map<string, IModule>();
            await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(registered.has('b')).toBe(true);
        });

        it('should not re-import package when expectedName is already registered', async () => {
            const moduleA = createMockModule('a', [{ name: 'b', package: '@scope/b' }]);
            const moduleB = createMockModule('b');
            const importFn = vi.fn(createMockImportFn({
                a: { default: moduleA },
            }));

            const registered = new Map<string, IModule>();
            registered.set('b', moduleB);

            await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            // Should only import 'a', not '@scope/b' since 'b' is already registered
            expect(importFn).toHaveBeenCalledTimes(1);
            expect(importFn).toHaveBeenCalledWith('a');
        });

        it('should skip optional dependencies that fail to resolve', async () => {
            const moduleA = createMockModule('a', [
                { name: 'required', optional: false },
                { name: 'optional-missing', optional: true },
            ]);
            const moduleRequired = createMockModule('required');
            const importFn = createMockImportFn({
                a: { default: moduleA },
                required: { default: moduleRequired },
            });

            const registered = new Map<string, IModule>();
            const resolved = await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(2);
            expect(registered.has('a')).toBe(true);
            expect(registered.has('required')).toBe(true);
            expect(registered.has('optional-missing')).toBe(false);
        });

        it('should resolve optional dependencies when available', async () => {
            const moduleA = createMockModule('a', [
                { name: 'opt', optional: true },
            ]);
            const moduleOpt = createMockModule('opt');
            const importFn = createMockImportFn({
                a: { default: moduleA },
                opt: { default: moduleOpt },
            });

            const registered = new Map<string, IModule>();
            const resolved = await resolveExternalModules({
                pending: [{ name: 'a', source: 'explicit' }],
                registered,
                importFn,
            });

            expect(resolved).toHaveLength(2);
            expect(registered.has('opt')).toBe(true);
        });

        it('should throw RESOLUTION_DEPTH_EXCEEDED when depth limit reached', async () => {
            expect.assertions(1);
            // Create a chain deeper than maxDepth
            const modules: Record<string, unknown> = {};
            for (let i = 0; i < 5; i++) {
                const dep = i < 4 ? [`mod${i + 1}`] : undefined;
                modules[`mod${i}`] = { default: createMockModule(`mod${i}`, dep) };
            }
            const importFn = createMockImportFn(modules);

            try {
                await resolveExternalModules({
                    pending: [{ name: 'mod0', source: 'explicit' }],
                    registered: new Map(),
                    importFn,
                    maxDepth: 2,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.RESOLUTION_DEPTH_EXCEEDED);
            }
        });
    });

    describe('auto-install', () => {
        it('should call installFn when import fails and autoInstall is true', async () => {
            const module = createMockModule('redis');
            let importAttempt = 0;
            const importFn = async () => {
                importAttempt++;
                if (importAttempt === 1) {
                    throw new Error('not found');
                }
                return { default: module };
            };
            const installFn = vi.fn(async () => { /* success */ });

            await resolveExternalModules({
                pending: [{ name: 'redis', source: 'explicit' }],
                registered: new Map(),
                autoInstall: true,
                importFn,
                installFn,
            });

            expect(installFn).toHaveBeenCalledWith('redis');
        });

        it('should not call installFn when autoInstall is false', async () => {
            const importFn = createMockImportFn({});
            const installFn = vi.fn();

            await expect(resolveExternalModules({
                pending: [{ name: 'missing', source: 'explicit' }],
                registered: new Map(),
                autoInstall: false,
                importFn,
                installFn,
            })).rejects.toThrow(ApplicationError);

            expect(installFn).not.toHaveBeenCalled();
        });

        it('should throw MODULE_INSTALL_FAILED when install fails', async () => {
            expect.assertions(2);
            const importFn = createMockImportFn({});
            const installFn = vi.fn(async () => { throw new Error('network error'); });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'broken', source: 'explicit' }],
                    registered: new Map(),
                    autoInstall: true,
                    importFn,
                    installFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.MODULE_INSTALL_FAILED);
                expect((error as ApplicationError).message).toContain('network error');
            }
        });

        it('should throw MODULE_NOT_FOUND when import still fails after install', async () => {
            expect.assertions(1);
            const importFn = createMockImportFn({});
            const installFn = vi.fn(async () => { /* success but module still not found */ });

            try {
                await resolveExternalModules({
                    pending: [{ name: 'ghost', source: 'explicit' }],
                    registered: new Map(),
                    autoInstall: true,
                    importFn,
                    installFn,
                });
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.MODULE_NOT_FOUND);
            }
        });
    });
});

describe('Application — external modules', () => {
    it('should accept tuple module input via addModule', () => {
        const app = new Application();
        app.addModule(['redis', { host: 'localhost' }]);
        // Verifies no throw — the module is stored as pending
    });

    it('should accept string module input via addModule', () => {
        const app = new Application();
        app.addModule('redis');
        // Verifies no throw — the module is stored as pending
    });

    it('should accept mixed module types in constructor', () => {
        const app = new Application({
            modules: [
                createMockModule('internal'),
                'external-string',
                ['external-tuple', { port: 6379 }],
            ],
        });
        // internal module is immediately registered
        expect(app.getModuleStatus('internal')).toBe('pending');
    });

    it('should accept a custom container via constructor', () => {
        const container = new Container();
        const app = new Application({ container });
        expect(app.container).toBe(container);
    });

    describe('resolveCache option', () => {
        it('should cache resolved modules by default', async () => {
            const module = createMockModule('a');
            const app = new Application({
                modules: [module],
            });

            await app.setup();
            await app.teardown();
            await app.setup();
        });
    });
});

describe('resolveExternalModules — re-resolution', () => {
    it('should produce fresh module instances when called again after clearing registered', async () => {
        let callCount = 0;
        const importFn = async (name: string) => {
            if (name === 'redis') {
                callCount++;
                return {
                    default: {
                        name: 'redis',
                        version: `1.0.${callCount}`,
                        async setup() { /* noop */ },
                    },
                };
            }
            throw new Error(`Cannot find module '${name}'`);
        };

        const registered = new Map<string, IModule>();
        const pending = [{ name: 'redis' as const, source: 'explicit' as const }];

        // First resolution
        const resolved1 = await resolveExternalModules({
            pending: [...pending],
            registered,
            importFn,
        });
        expect(resolved1).toHaveLength(1);
        expect(resolved1[0].version).toBe('1.0.1');

        // Clear and re-resolve (simulates resolveCache: false)
        registered.delete('redis');
        const resolved2 = await resolveExternalModules({
            pending: [...pending],
            registered,
            importFn,
        });
        expect(resolved2).toHaveLength(1);
        expect(resolved2[0].version).toBe('1.0.2');
        expect(callCount).toBe(2);
    });
});
