import { describe, expect, it, vi } from 'vitest';
import type { IContainer } from 'eldin';
import { Application } from '../../src';
import type { IModule } from '../../src';

function createModule(
    name: string,
    opts: {
        dependsOn?: string[];
        onReady?: IModule['onReady'];
        onError?: IModule['onError'];
        startFn?: (container: IContainer) => Promise<void>;
    } = {},
): IModule {
    return {
        name,
        dependsOn: opts.dependsOn,
        async start(container) {
            if (opts.startFn) {
                await opts.startFn(container);
            }
        },
        onReady: opts.onReady,
        onError: opts.onError,
    };
}

describe('Lifecycle Hooks', () => {
    describe('onReady', () => {
        it('should call onReady after all modules have started', async () => {
            const events: string[] = [];
            const app = new Application([
                createModule('a', {
                    startFn: async () => { events.push('start:a'); },
                    onReady: async () => { events.push('ready:a'); },
                }),
                createModule('b', {
                    dependsOn: ['a'],
                    startFn: async () => { events.push('start:b'); },
                    onReady: async () => { events.push('ready:b'); },
                }),
            ]);

            await app.start();

            expect(events).toEqual([
                'start:a',
                'start:b',
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

            await app.start();
            expect(readyContainer).toBe(app.container);
        });

        it('should skip modules without onReady', async () => {
            const events: string[] = [];
            const app = new Application([
                createModule('a', {
                    startFn: async () => { events.push('start:a'); },
                }),
                createModule('b', {
                    startFn: async () => { events.push('start:b'); },
                    onReady: async () => { events.push('ready:b'); },
                }),
            ]);

            await app.start();
            expect(events).toEqual(['start:a', 'start:b', 'ready:b']);
        });
    });

    describe('onError', () => {
        it('should call onError when start() throws', async () => {
            const onError = vi.fn();
            const error = new Error('startup failed');
            const app = new Application([
                createModule('a', {
                    startFn: async () => { throw error; },
                    onError,
                }),
            ]);

            await expect(app.start()).rejects.toThrow('startup failed');
            expect(onError).toHaveBeenCalledWith(error, app.container);
        });

        it('should not call onReady if a module fails to start', async () => {
            const onReady = vi.fn();
            const app = new Application([
                createModule('a', {
                    startFn: async () => { throw new Error('fail'); },
                    onReady,
                }),
            ]);

            await expect(app.start()).rejects.toThrow('fail');
            expect(onReady).not.toHaveBeenCalled();
        });

        it('should only call onError on the failing module', async () => {
            const onErrorA = vi.fn();
            const onErrorB = vi.fn();
            const app = new Application([
                createModule('a', { onError: onErrorA }),
                createModule('b', {
                    dependsOn: ['a'],
                    startFn: async () => { throw new Error('b failed'); },
                    onError: onErrorB,
                }),
            ]);

            await expect(app.start()).rejects.toThrow('b failed');
            expect(onErrorA).not.toHaveBeenCalled();
            expect(onErrorB).toHaveBeenCalledOnce();
        });

        it('should still throw the original error even if onError is defined', async () => {
            const error = new Error('original');
            const app = new Application([
                createModule('a', {
                    startFn: async () => { throw error; },
                    onError: async () => { /* swallow */ },
                }),
            ]);

            await expect(app.start()).rejects.toThrow(error);
        });

        it('should throw the original error even if onError itself throws', async () => {
            const original = new Error('original');
            const app = new Application([
                createModule('a', {
                    startFn: async () => { throw original; },
                    onError: async () => { throw new Error('handler broke'); },
                }),
            ]);

            await expect(app.start()).rejects.toThrow(original);
        });

        it('should work when no onError handler is defined', async () => {
            const app = new Application([
                createModule('a', {
                    startFn: async () => { throw new Error('no handler'); },
                }),
            ]);

            await expect(app.start()).rejects.toThrow('no handler');
        });

        it('should tear down already-started modules on failure', async () => {
            const events: string[] = [];
            const app = new Application([
                {
                    name: 'a',
                    async start() { events.push('start:a'); },
                    async stop() { events.push('stop:a'); },
                },
                {
                    name: 'b',
                    dependsOn: ['a'],
                    async start() { events.push('start:b'); },
                    async stop() { events.push('stop:b'); },
                },
                {
                    name: 'c',
                    dependsOn: ['b'],
                    async start() { throw new Error('c failed'); },
                    async stop() { events.push('stop:c'); },
                },
            ]);

            await expect(app.start()).rejects.toThrow('c failed');
            expect(events).toEqual([
                'start:a',
                'start:b',
                'stop:b',
                'stop:a',
            ]);
        });

        it('should continue teardown if a stop() throws during rollback', async () => {
            const stops: string[] = [];
            const app = new Application([
                {
                    name: 'a',
                    async start() { /* ok */ },
                    async stop() { stops.push('a'); },
                },
                {
                    name: 'b',
                    dependsOn: ['a'],
                    async start() { /* ok */ },
                    async stop() { throw new Error('stop:b failed'); },
                },
                {
                    name: 'c',
                    dependsOn: ['b'],
                    async start() { throw new Error('start:c failed'); },
                },
            ]);

            await expect(app.start()).rejects.toThrow('start:c failed');
            expect(stops).toEqual(['a']);
        });

        it('should not tear down the failing module itself', async () => {
            const stops: string[] = [];
            const app = new Application([
                {
                    name: 'a',
                    async start() { /* ok */ },
                    async stop() { stops.push('a'); },
                },
                {
                    name: 'b',
                    dependsOn: ['a'],
                    async start() { throw new Error('fail'); },
                    async stop() { stops.push('b'); },
                },
            ]);

            await expect(app.start()).rejects.toThrow('fail');
            expect(stops).toEqual(['a']);
        });
    });
});
