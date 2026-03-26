import { describe, expect, it } from 'vitest';
import { TypedToken } from 'eldin';
import type { IContainer } from 'eldin';
import { Application, ApplicationError } from '../../src';
import type { IModule } from '../../src';

function createModule(
    name: string,
    opts: { dependsOn?: string[]; order?: string[]; stopOrder?: string[]; hasStop?: boolean } = {},
): IModule {
    return {
        name,
        dependsOn: opts.dependsOn,
        async start() {
            opts.order?.push(name);
        },
        ...(opts.hasStop !== false && {
            async stop() {
                opts.stopOrder?.push(name);
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
            await app.start();
            expect(order).toEqual(['a']);
        });

        it('should add multiple modules via addModules()', async () => {
            const order: string[] = [];
            const app = new Application();
            app.addModules([
                createModule('a', { order }),
                createModule('b', { order }),
            ]);
            await app.start();
            expect(order).toHaveLength(2);
        });

        it('should accept initial modules via constructor', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('a', { order }),
                createModule('b', { order }),
            ]);
            await app.start();
            expect(order).toHaveLength(2);
        });
    });

    describe('start order (topological sort)', () => {
        it('should start modules with no dependencies in registration order', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('a', { order }),
                createModule('b', { order }),
                createModule('c', { order }),
            ]);
            await app.start();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should start modules after their dependencies', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('b', { order, dependsOn: ['a'] }),
                createModule('a', { order }),
            ]);
            await app.start();
            expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        });

        it('should resolve start order regardless of registration order', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('c', { order, dependsOn: ['b'] }),
                createModule('b', { order, dependsOn: ['a'] }),
                createModule('a', { order }),
            ]);
            await app.start();
            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('should resolve deep dependency chains (A → B → C → D)', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('d', { order, dependsOn: ['c'] }),
                createModule('c', { order, dependsOn: ['b'] }),
                createModule('b', { order, dependsOn: ['a'] }),
                createModule('a', { order }),
            ]);
            await app.start();
            expect(order).toEqual(['a', 'b', 'c', 'd']);
        });

        it('should resolve diamond dependencies correctly', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('a', { order, dependsOn: ['b', 'c'] }),
                createModule('b', { order, dependsOn: ['d'] }),
                createModule('c', { order, dependsOn: ['d'] }),
                createModule('d', { order }),
            ]);
            await app.start();
            expect(order.indexOf('d')).toBeLessThan(order.indexOf('b'));
            expect(order.indexOf('d')).toBeLessThan(order.indexOf('c'));
            expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
            expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
        });
    });

    describe('stop order', () => {
        it('should stop modules in reverse start order', async () => {
            const startOrder: string[] = [];
            const stopOrder: string[] = [];
            const app = new Application([
                createModule('c', { order: startOrder, stopOrder, dependsOn: ['b'] }),
                createModule('b', { order: startOrder, stopOrder, dependsOn: ['a'] }),
                createModule('a', { order: startOrder, stopOrder }),
            ]);
            await app.start();
            await app.stop();
            expect(stopOrder).toEqual([...startOrder].reverse());
        });

        it('should skip modules without stop()', async () => {
            const stopOrder: string[] = [];
            const app = new Application([
                createModule('a', { stopOrder }),
                createModule('b', { stopOrder, hasStop: false }),
                createModule('c', { stopOrder }),
            ]);
            await app.start();
            await app.stop();
            expect(stopOrder).toEqual(['c', 'a']);
        });

        it('should pass the same container to stop()', async () => {
            let stopContainer: IContainer | undefined;
            const app = new Application();
            app.addModule({
                name: 'a',
                async start() {},
                async stop(container) {
                    stopContainer = container;
                },
            });
            await app.start();
            await app.stop();
            expect(stopContainer).toBe(app.container);
        });
    });

    describe('circular dependency detection', () => {
        it('should throw ApplicationError for two modules depending on each other', async () => {
            const app = new Application([
                createModule('a', { dependsOn: ['b'] }),
                createModule('b', { dependsOn: ['a'] }),
            ]);
            await expect(app.start()).rejects.toThrow(ApplicationError);
        });

        it('should throw ApplicationError for a three-way cycle', async () => {
            const app = new Application([
                createModule('a', { dependsOn: ['c'] }),
                createModule('b', { dependsOn: ['a'] }),
                createModule('c', { dependsOn: ['b'] }),
            ]);
            await expect(app.start()).rejects.toThrow(ApplicationError);
        });

        it('should include module names in the error message', async () => {
            const app = new Application([
                createModule('x', { dependsOn: ['y'] }),
                createModule('y', { dependsOn: ['x'] }),
            ]);
            await expect(app.start()).rejects.toThrow(/x/);
            await expect(app.start()).rejects.toThrow(/y/);
        });
    });

    describe('missing dependencies', () => {
        it('should silently skip unregistered dependencies', async () => {
            const order: string[] = [];
            const app = new Application([
                createModule('a', { order, dependsOn: ['nonexistent'] }),
            ]);
            await app.start();
            expect(order).toEqual(['a']);
        });
    });

    describe('container sharing', () => {
        it('should share the container across all modules', async () => {
            const Token = new TypedToken<string>('test');
            const app = new Application([
                {
                    name: 'producer',
                    async start(container) {
                        container.register(Token, { useValue: 'hello' });
                    },
                },
                {
                    name: 'consumer',
                    dependsOn: ['producer'],
                    async start(container) {
                        expect(container.resolve(Token)).toBe('hello');
                    },
                },
            ]);
            await app.start();
        });

        it('should expose container after construction', () => {
            const app = new Application();
            expect(app.container).toBeDefined();
        });
    });
});
