import { describe, expect, it } from 'vitest';
import { TypedToken } from 'eldin';
import type { IContainer } from 'eldin';
import { Application, ApplicationError, ApplicationErrorCode } from '../../src';
import type { IModule } from '../../src';

function createModule(
    name: string,
    opts: { dependencies?: string[]; order?: string[]; teardownOrder?: string[]; hasTeardown?: boolean } = {},
): IModule {
    return {
        name,
        dependencies: opts.dependencies,
        async setup() {
            opts.order?.push(name);
        },
        ...(opts.hasTeardown !== false && {
            async teardown() {
                opts.teardownOrder?.push(name);
            },
        }),
    };
}

describe('Application', () => {
    describe('module registration', () => {
        it('should add a single module via addModule()', async () => {
            const order: string[] = [];
            const app = new Application();
            app.addModule(createModule('a', { order }));
            await app.setup();
            expect(order).toEqual(['a']);
        });

        it('should add multiple modules via addModules()', async () => {
            const order: string[] = [];
            const app = new Application();
            app.addModules([
                createModule('a', { order }),
                createModule('b', { order }),
            ]);
            await app.setup();
            expect(order).toHaveLength(2);
        });

        it('should accept initial modules via constructor', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { order }),
                    createModule('b', { order }),
                ],
            });
            await app.setup();
            expect(order).toHaveLength(2);
        });
    });

    describe('setup order (topological sort)', () => {
        it('should set up modules with no dependencies in registration order', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { order }),
                    createModule('b', { order }),
                    createModule('c', { order }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should set up modules after their dependencies', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('b', { order, dependencies: ['a'] }),
                    createModule('a', { order }),
                ],
            });
            await app.setup();
            expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        });

        it('should resolve setup order regardless of registration order', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('c', { order, dependencies: ['b'] }),
                    createModule('b', { order, dependencies: ['a'] }),
                    createModule('a', { order }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should resolve deep dependency chains (A → B → C → D)', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('d', { order, dependencies: ['c'] }),
                    createModule('c', { order, dependencies: ['b'] }),
                    createModule('b', { order, dependencies: ['a'] }),
                    createModule('a', { order }),
                ],
            });
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c', 'd']);
        });

        it('should resolve diamond dependencies correctly', async () => {
            const order: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { order, dependencies: ['b', 'c'] }),
                    createModule('b', { order, dependencies: ['d'] }),
                    createModule('c', { order, dependencies: ['d'] }),
                    createModule('d', { order }),
                ],
            });
            await app.setup();
            expect(order.indexOf('d')).toBeLessThan(order.indexOf('b'));
            expect(order.indexOf('d')).toBeLessThan(order.indexOf('c'));
            expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
            expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
        });
    });

    describe('teardown order', () => {
        it('should tear down modules in reverse setup order', async () => {
            const setupOrder: string[] = [];
            const teardownOrder: string[] = [];
            const app = new Application({
                modules: [
                    createModule('c', { order: setupOrder, teardownOrder, dependencies: ['b'] }),
                    createModule('b', { order: setupOrder, teardownOrder, dependencies: ['a'] }),
                    createModule('a', { order: setupOrder, teardownOrder }),
                ],
            });
            await app.setup();
            await app.teardown();
            expect(teardownOrder).toEqual([...setupOrder].reverse());
        });

        it('should skip modules without teardown()', async () => {
            const teardownOrder: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', { teardownOrder }),
                    createModule('b', { teardownOrder, hasTeardown: false }),
                    createModule('c', { teardownOrder }),
                ],
            });
            await app.setup();
            await app.teardown();
            expect(teardownOrder).toEqual(['c', 'a']);
        });

        it('should pass the same container to teardown()', async () => {
            let teardownContainer: IContainer | undefined;
            const app = new Application();
            app.addModule({
                name: 'a',
                async setup() { /* noop */ },
                async teardown(container) {
                    teardownContainer = container;
                },
            });
            await app.setup();
            await app.teardown();
            expect(teardownContainer).toBe(app.container);
        });
    });

    describe('circular dependency detection', () => {
        it('should throw ApplicationError for two modules depending on each other', async () => {
            expect.assertions(2);
            const app = new Application({
                modules: [
                    createModule('a', { dependencies: ['b'] }),
                    createModule('b', { dependencies: ['a'] }),
                ],
            });
            try {
                await app.setup();
            } catch (error) {
                expect(error).toBeInstanceOf(ApplicationError);
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.CIRCULAR_DEPENDENCY);
            }
        });

        it('should throw ApplicationError for a three-way cycle', async () => {
            expect.assertions(2);
            const app = new Application({
                modules: [
                    createModule('a', { dependencies: ['c'] }),
                    createModule('b', { dependencies: ['a'] }),
                    createModule('c', { dependencies: ['b'] }),
                ],
            });
            try {
                await app.setup();
            } catch (error) {
                expect(error).toBeInstanceOf(ApplicationError);
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.CIRCULAR_DEPENDENCY);
            }
        });

        it('should include module names in the error message', async () => {
            expect.assertions(3);
            const app = new Application({
                modules: [
                    createModule('x', { dependencies: ['y'] }),
                    createModule('y', { dependencies: ['x'] }),
                ],
            });
            try {
                await app.setup();
            } catch (error) {
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.CIRCULAR_DEPENDENCY);
                expect((error as Error).message).toMatch(/x/);
                expect((error as Error).message).toMatch(/y/);
            }
        });
    });

    describe('missing dependencies', () => {
        it('should throw for unregistered non-optional dependencies', async () => {
            expect.assertions(3);
            const app = new Application({
                modules: [
                    createModule('a', { dependencies: ['nonexistent'] }),
                ],
            });
            try {
                await app.setup();
            } catch (error) {
                expect(error).toBeInstanceOf(ApplicationError);
                expect((error as ApplicationError).code).toBe(ApplicationErrorCode.MODULE_NOT_FOUND);
                expect((error as Error).message).toContain('nonexistent');
            }
        });
    });

    describe('container sharing', () => {
        it('should share the container across all modules', async () => {
            const Token = new TypedToken<string>('test');
            const app = new Application({
                modules: [
                    {
                        name: 'producer',
                        async setup(container) {
                            container.register(Token, { useValue: 'hello' });
                        },
                    },
                    {
                        name: 'consumer',
                        dependencies: ['producer'],
                        async setup(container) {
                            expect(container.resolve(Token)).toBe('hello');
                        },
                    },
                ],
            });
            await app.setup();
        });

        it('should expose container after construction', () => {
            const app = new Application();
            expect(app.container).toBeDefined();
        });
    });
});
