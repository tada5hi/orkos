import { describe, expect, it, vi } from 'vitest';
import type { IContainer } from 'eldin';
import { Application, defineModule } from '../../src';

describe('Lifecycle Hooks', () => {
    describe('onReady', () => {
        it('should call onReady after all modules have been set up', async () => {
            const events: string[] = [];
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { events.push('setup:a'); },
                    async onReady() { events.push('ready:a'); },
                })(),
                defineModule({
                    name: 'b',
                    dependsOn: ['a'],
                    async setup() { events.push('setup:b'); },
                    async onReady() { events.push('ready:b'); },
                })(),
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
                defineModule({
                    name: 'a',
                    async setup() {},
                    async onReady(container) { readyContainer = container; },
                })(),
            ]);

            await app.setup();
            expect(readyContainer).toBe(app.container);
        });

        it('should skip modules without onReady', async () => {
            const events: string[] = [];
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { events.push('setup:a'); },
                })(),
                defineModule({
                    name: 'b',
                    async setup() { events.push('setup:b'); },
                    async onReady() { events.push('ready:b'); },
                })(),
            ]);

            await app.setup();
            expect(events).toEqual(['setup:a', 'setup:b', 'ready:b']);
        });
    });

    describe('onError', () => {
        it('should call onError when setup() throws', async () => {
            let caughtError: Error | undefined;
            let errorContainer: IContainer | undefined;
            const error = new Error('setup failed');
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { throw error; },
                    async onError(err, container) {
                        caughtError = err;
                        errorContainer = container;
                    },
                })(),
            ]);

            await expect(app.setup()).rejects.toThrow('setup failed');
            expect(caughtError).toBe(error);
            expect(errorContainer).toBe(app.container);
        });

        it('should not call onReady if a module fails to set up', async () => {
            const onReady = vi.fn();
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { throw new Error('fail'); },
                    async onReady() { onReady(); },
                })(),
            ]);

            await expect(app.setup()).rejects.toThrow('fail');
            expect(onReady).not.toHaveBeenCalled();
        });

        it('should only call onError on the failing module', async () => {
            const onErrorA = vi.fn();
            const onErrorB = vi.fn();
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() {},
                    async onError() { onErrorA(); },
                })(),
                defineModule({
                    name: 'b',
                    dependsOn: ['a'],
                    async setup() { throw new Error('b failed'); },
                    async onError() { onErrorB(); },
                })(),
            ]);

            await expect(app.setup()).rejects.toThrow('b failed');
            expect(onErrorA).not.toHaveBeenCalled();
            expect(onErrorB).toHaveBeenCalledOnce();
        });

        it('should still throw the original error even if onError is defined', async () => {
            const error = new Error('original');
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { throw error; },
                    async onError() { /* swallow */ },
                })(),
            ]);

            await expect(app.setup()).rejects.toThrow(error);
        });

        it('should throw the original error even if onError itself throws', async () => {
            const original = new Error('original');
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { throw original; },
                    async onError() { throw new Error('handler broke'); },
                })(),
            ]);

            await expect(app.setup()).rejects.toThrow(original);
        });

        it('should work when no onError handler is defined', async () => {
            const app = new Application([
                defineModule({
                    name: 'a',
                    async setup() { throw new Error('no handler'); },
                })(),
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
                    dependsOn: ['a'],
                    async setup() { events.push('setup:b'); },
                    async teardown() { events.push('teardown:b'); },
                },
                {
                    name: 'c',
                    dependsOn: ['b'],
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
                    dependsOn: ['a'],
                    async setup() { /* ok */ },
                    async teardown() { throw new Error('teardown:b failed'); },
                },
                {
                    name: 'c',
                    dependsOn: ['b'],
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
                    dependsOn: ['a'],
                    async setup() { throw new Error('fail'); },
                    async teardown() { teardowns.push('b'); },
                },
            ]);

            await expect(app.setup()).rejects.toThrow('fail');
            expect(teardowns).toEqual(['a']);
        });
    });
});
