import { describe, expect, it } from 'vitest';
import { TypedToken } from 'eldin';
import type { IContainer } from 'eldin';
import { Application, ApplicationError, defineModule } from '../../src';

describe('Application', () => {
    describe('module registration', () => {
        it('should add a single module via addModule()', async () => {
            const order: string[] = [];
            const app = new Application();
            app.addModule(defineModule({
                name: 'a',
                async setup() { order.push('a'); },
            })());
            await app.setup();
            expect(order).toEqual(['a']);
        });

        it('should add multiple modules via addModules()', async () => {
            const order: string[] = [];
            const app = new Application();
            app.addModules([
                defineModule({
                    name: 'a',
                    async setup() { order.push('a'); },
                })(),
                defineModule({
                    name: 'b',
                    async setup() { order.push('b'); },
                })(),
            ]);
            await app.setup();
            expect(order).toHaveLength(2);
        });

        it('should accept initial modules via constructor', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { order.push('a'); },
                })(),
                defineModule({
                    name: 'b',
                    async setup() { order.push('b'); },
                })(),
            ]);
            await app.setup();
            expect(order).toHaveLength(2);
        });
    });

    describe('setup order (topological sort)', () => {
        it('should set up modules with no dependencies in registration order', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({ name: 'a', async setup() { order.push('a'); } })(),
                defineModule({ name: 'b', async setup() { order.push('b'); } })(),
                defineModule({ name: 'c', async setup() { order.push('c'); } })(),
            ]);
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should set up modules after their dependencies', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({ name: 'b', dependsOn: ['a'], async setup() { order.push('b'); } })(),
                defineModule({ name: 'a', async setup() { order.push('a'); } })(),
            ]);
            await app.setup();
            expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        });

        it('should resolve setup order regardless of registration order', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({ name: 'c', dependsOn: ['b'], async setup() { order.push('c'); } })(),
                defineModule({ name: 'b', dependsOn: ['a'], async setup() { order.push('b'); } })(),
                defineModule({ name: 'a', async setup() { order.push('a'); } })(),
            ]);
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should resolve deep dependency chains (A → B → C → D)', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({ name: 'd', dependsOn: ['c'], async setup() { order.push('d'); } })(),
                defineModule({ name: 'c', dependsOn: ['b'], async setup() { order.push('c'); } })(),
                defineModule({ name: 'b', dependsOn: ['a'], async setup() { order.push('b'); } })(),
                defineModule({ name: 'a', async setup() { order.push('a'); } })(),
            ]);
            await app.setup();
            expect(order).toEqual(['a', 'b', 'c', 'd']);
        });

        it('should resolve diamond dependencies correctly', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({ name: 'a', dependsOn: ['b', 'c'], async setup() { order.push('a'); } })(),
                defineModule({ name: 'b', dependsOn: ['d'], async setup() { order.push('b'); } })(),
                defineModule({ name: 'c', dependsOn: ['d'], async setup() { order.push('c'); } })(),
                defineModule({ name: 'd', async setup() { order.push('d'); } })(),
            ]);
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
            const app = new Application([
                defineModule({
                    name: 'c',
                    dependsOn: ['b'],
                    async setup() { setupOrder.push('c'); },
                    async teardown() { teardownOrder.push('c'); },
                })(),
                defineModule({
                    name: 'b',
                    dependsOn: ['a'],
                    async setup() { setupOrder.push('b'); },
                    async teardown() { teardownOrder.push('b'); },
                })(),
                defineModule({
                    name: 'a',
                    async setup() { setupOrder.push('a'); },
                    async teardown() { teardownOrder.push('a'); },
                })(),
            ]);
            await app.setup();
            await app.teardown();
            expect(teardownOrder).toEqual([...setupOrder].reverse());
        });

        it('should skip modules without teardown()', async () => {
            const teardownOrder: string[] = [];
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() {},
                    async teardown() { teardownOrder.push('a'); },
                })(),
                defineModule({
                    name: 'b',
                    async setup() {},
                })(),
                defineModule({
                    name: 'c',
                    async setup() {},
                    async teardown() { teardownOrder.push('c'); },
                })(),
            ]);
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
            const app = new Application([
                defineModule({ name: 'a', dependsOn: ['b'], async setup() {} })(),
                defineModule({ name: 'b', dependsOn: ['a'], async setup() {} })(),
            ]);
            await expect(app.setup()).rejects.toThrow(ApplicationError);
        });

        it('should throw ApplicationError for a three-way cycle', async () => {
            const app = new Application([
                defineModule({ name: 'a', dependsOn: ['c'], async setup() {} })(),
                defineModule({ name: 'b', dependsOn: ['a'], async setup() {} })(),
                defineModule({ name: 'c', dependsOn: ['b'], async setup() {} })(),
            ]);
            await expect(app.setup()).rejects.toThrow(ApplicationError);
        });

        it('should include module names in the error message', async () => {
            const app = new Application([
                defineModule({ name: 'x', dependsOn: ['y'], async setup() {} })(),
                defineModule({ name: 'y', dependsOn: ['x'], async setup() {} })(),
            ]);
            await expect(app.setup()).rejects.toThrow(/x/);
            await expect(app.setup()).rejects.toThrow(/y/);
        });
    });

    describe('missing dependencies', () => {
        it('should silently skip unregistered dependencies', async () => {
            const order: string[] = [];
            const app = new Application([
                defineModule({ name: 'a', dependsOn: ['nonexistent'], async setup() { order.push('a'); } })(),
            ]);
            await app.setup();
            expect(order).toEqual(['a']);
        });
    });

    describe('container sharing', () => {
        it('should share the container across all modules', async () => {
            const Token = new TypedToken<string>('test');
            const app = new Application([
                {
                    name: 'producer',
                    async setup(container) {
                        container.register(Token, { useValue: 'hello' });
                    },
                },
                {
                    name: 'consumer',
                    dependsOn: ['producer'],
                    async setup(container) {
                        expect(container.resolve(Token)).toBe('hello');
                    },
                },
            ]);
            await app.setup();
        });

        it('should expose container after construction', () => {
            const app = new Application();
            expect(app.container).toBeDefined();
        });
    });
});
