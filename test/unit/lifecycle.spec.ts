import { describe, expect, it, vi } from 'vitest';
import type { IContainer } from 'eldin';
import { Application } from '../../src';
import type { IModule } from '../../src';

function createModule(
    name: string,
    opts: {
        dependencies?: string[];
        onReady?: IModule['onReady'];
        onError?: IModule['onError'];
        setupFn?: (container: IContainer) => Promise<void>;
    } = {},
): IModule {
    return {
        name,
        dependencies: opts.dependencies,
        async setup(container) {
            if (opts.setupFn) {
                await opts.setupFn(container);
            }
        },
        onReady: opts.onReady,
        onError: opts.onError,
    };
}

describe('Lifecycle Hooks', () => {
    describe('onReady', () => {
        it('should call onReady after all modules have been set up', async () => {
            const events: string[] = [];
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { events.push('setup:a'); },
                    onReady: async () => { events.push('ready:a'); },
                }),
                createModule('b', {
                    dependencies: ['a'],
                    setupFn: async () => { events.push('setup:b'); },
                    onReady: async () => { events.push('ready:b'); },
                }),
            ]);

            await app.setup();

            expect(events).toEqual([
                'setup:a',
                'setup:b',
                'ready:a',
                'ready:b',
            ]);
        });

        it('should pass the container to onReady', async () => {
            let readyContainer: IContainer | undefined;
            const app = new Application([
                createModule('a', {
                    onReady: async (container) => { readyContainer = container; },
                }),
            ]);

            await app.setup();
            expect(readyContainer).toBe(app.container);
        });

        it('should skip modules without onReady', async () => {
            const events: string[] = [];
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { events.push('setup:a'); },
                }),
                createModule('b', {
                    setupFn: async () => { events.push('setup:b'); },
                    onReady: async () => { events.push('ready:b'); },
                }),
            ]);

            await app.setup();
            expect(events).toEqual(['setup:a', 'setup:b', 'ready:b']);
        });
    });

    describe('onError', () => {
        it('should call onError when setup() throws', async () => {
            const onError = vi.fn();
            const error = new Error('setup failed');
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { throw error; },
                    onError,
                }),
            ]);

            await expect(app.setup()).rejects.toThrow('setup failed');
            expect(onError).toHaveBeenCalledWith(error, app.container);
        });

        it('should not call onReady if a module fails to set up', async () => {
            const onReady = vi.fn();
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { throw new Error('fail'); },
                    onReady,
                }),
            ]);

            await expect(app.setup()).rejects.toThrow('fail');
            expect(onReady).not.toHaveBeenCalled();
        });

        it('should only call onError on the failing module', async () => {
            const onErrorA = vi.fn();
            const onErrorB = vi.fn();
            const app = new Application([
                createModule('a', { onError: onErrorA }),
                createModule('b', {
                    dependencies: ['a'],
                    setupFn: async () => { throw new Error('b failed'); },
                    onError: onErrorB,
                }),
            ]);

            await expect(app.setup()).rejects.toThrow('b failed');
            expect(onErrorA).not.toHaveBeenCalled();
            expect(onErrorB).toHaveBeenCalledOnce();
        });

        it('should still throw the original error even if onError is defined', async () => {
            const error = new Error('original');
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { throw error; },
                    onError: async () => { /* swallow */ },
                }),
            ]);

            await expect(app.setup()).rejects.toThrow(error);
        });

        it('should throw the original error even if onError itself throws', async () => {
            const original = new Error('original');
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { throw original; },
                    onError: async () => { throw new Error('handler broke'); },
                }),
            ]);

            await expect(app.setup()).rejects.toThrow(original);
        });

        it('should work when no onError handler is defined', async () => {
            const app = new Application([
                createModule('a', {
                    setupFn: async () => { throw new Error('no handler'); },
                }),
            ]);

            await expect(app.setup()).rejects.toThrow('no handler');
        });

        it('should tear down already-set-up modules on failure', async () => {
            const events: string[] = [];
            const app = new Application([
                {
                    name: 'a',
                    async setup() { events.push('setup:a'); },
                    async teardown() { events.push('teardown:a'); },
                },
                {
                    name: 'b',
                    dependencies: ['a'],
                    async setup() { events.push('setup:b'); },
                    async teardown() { events.push('teardown:b'); },
                },
                {
                    name: 'c',
                    dependencies: ['b'],
                    async setup() { throw new Error('c failed'); },
                    async teardown() { events.push('teardown:c'); },
                },
            ]);

            await expect(app.setup()).rejects.toThrow('c failed');
            expect(events).toEqual([
                'setup:a',
                'setup:b',
                'teardown:b',
                'teardown:a',
            ]);
        });

        it('should continue teardown if a teardown() throws during rollback', async () => {
            const teardowns: string[] = [];
            const app = new Application([
                {
                    name: 'a',
                    async setup() { /* ok */ },
                    async teardown() { teardowns.push('a'); },
                },
                {
                    name: 'b',
                    dependencies: ['a'],
                    async setup() { /* ok */ },
                    async teardown() { throw new Error('teardown:b failed'); },
                },
                {
                    name: 'c',
                    dependencies: ['b'],
                    async setup() { throw new Error('setup:c failed'); },
                },
            ]);

            await expect(app.setup()).rejects.toThrow('setup:c failed');
            expect(teardowns).toEqual(['a']);
        });

        it('should not tear down the failing module itself', async () => {
            const teardowns: string[] = [];
            const app = new Application([
                {
                    name: 'a',
                    async setup() { /* ok */ },
                    async teardown() { teardowns.push('a'); },
                },
                {
                    name: 'b',
                    dependencies: ['a'],
                    async setup() { throw new Error('fail'); },
                    async teardown() { teardowns.push('b'); },
                },
            ]);

            await expect(app.setup()).rejects.toThrow('fail');
            expect(teardowns).toEqual(['a']);
        });
    });
});
