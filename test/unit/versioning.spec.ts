import { describe, expect, it } from 'vitest';
import { Application, ApplicationError } from '../../src';
import type { IModule } from '../../src';

function createModule(
    name: string,
    opts: {
        version?: string;
        dependencies?: IModule['dependencies'];
        order?: string[];
    } = {},
): IModule {
    return {
        name,
        version: opts.version,
        dependencies: opts.dependencies,
        async setup() {
            opts.order?.push(name);
        },
    };
}

describe('Module Versioning', () => {
    describe('version field', () => {
        it('should accept modules with version', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { version: '1.0.0', order }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a']);
        });

        it('should accept modules without version', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { order }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a']);
        });
    });

    describe('ModuleDependency objects', () => {
        it('should support mixed string and object dependencies', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { version: '2.0.0', order }),
                    createModule('b', { version: '1.0.0', order }),
                    createModule('c', {
                        order,
                        dependencies: [
                            'b',
                            { name: 'a', version: '>=2.0.0' },
                        ],
                    }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should resolve dependency order with object dependencies', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('b', {
                        order,
                        dependencies: [{ name: 'a' }],
                    }),
                    createModule('a', { order }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a', 'b']);
        });
    });

    describe('version constraints', () => {
        it('should pass when version satisfies >= constraint', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('db', { version: '2.1.0', order }),
                    createModule('auth', {
                        order,
                        dependencies: [{ name: 'db', version: '>=2.0.0' }],
                    }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['db', 'auth']);
        });

        it('should throw when version does not satisfy >= constraint', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '1.5.0' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '>=2.0.0' }],
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow(ApplicationError);
            await expect(app.setup()).rejects.toThrow(/auth/);
            await expect(app.setup()).rejects.toThrow(/db/);
            await expect(app.setup()).rejects.toThrow(/>=2.0.0/);
            await expect(app.setup()).rejects.toThrow(/1.5.0/);
        });

        it('should pass when version satisfies ^ constraint', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '2.3.0' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '^2.1.0' }],
                    }),
                ],
            });
            await app.setup();
        });

        it('should throw when version exceeds ^ constraint major', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '3.0.0' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '^2.1.0' }],
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow(ApplicationError);
        });

        it('should pass when version satisfies ~ constraint', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '2.1.5' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '~2.1.0' }],
                    }),
                ],
            });
            await app.setup();
        });

        it('should throw when version exceeds ~ constraint minor', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '2.2.0' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '~2.1.0' }],
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow(ApplicationError);
        });

        it('should pass when version matches exact constraint', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '2.0.0' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '2.0.0' }],
                    }),
                ],
            });
            await app.setup();
        });

        it('should throw when version does not match exact constraint', async () => {
            const app = new Application({
                modules: [
                    createModule('db', { version: '2.0.1' }),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '2.0.0' }],
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow(ApplicationError);
        });

        it('should throw when dependency has version constraint but target has no version', async () => {
            const app = new Application({
                modules: [
                    createModule('db'),
                    createModule('auth', {
                        dependencies: [{ name: 'db', version: '>=1.0.0' }],
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow(ApplicationError);
            await expect(app.setup()).rejects.toThrow(/does not declare a version/);
        });
    });

    describe('optional dependencies', () => {
        it('should skip optional dependency when missing', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('auth', {
                        order,
                        dependencies: [{ name: 'ldap', optional: true }],
                    }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['auth']);
        });

        it('should resolve optional dependency when present', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('ldap', { version: '1.0.0', order }),
                    createModule('auth', {
                        order,
                        dependencies: [{ name: 'ldap', optional: true }],
                    }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['ldap', 'auth']);
        });

        it('should still validate version on optional dependency when present', async () => {
            const app = new Application({
                modules: [
                    createModule('ldap', { version: '1.0.0' }),
                    createModule('auth', {
                        dependencies: [{ name: 'ldap', optional: true, version: '>=2.0.0' }],
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow(ApplicationError);
        });
    });

    describe('no version constraint', () => {
        it('should skip version check when dependency has no version constraint', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('db', { version: '1.0.0', order }),
                    createModule('auth', {
                        order,
                        dependencies: [{ name: 'db' }],
                    }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['db', 'auth']);
        });

        it('should skip version check for string dependencies', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('db', { version: '1.0.0', order }),
                    createModule('auth', {
                        order,
                        dependencies: ['db'],
                    }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['db', 'auth']);
        });
    });
});
