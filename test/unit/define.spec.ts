import { describe, expect, it, vi } from 'vitest';
import type { IContainer } from 'eldin';
import { Application, defineModule } from '../../src';
import type { IModule } from '../../src';

describe('defineModule', () => {
    describe('ModuleDefinition', () => {
        it('should create a module with default options', async () => {
            const setupFn = vi.fn();

            const CreateModule = defineModule<{ ttl: number }>({
                name: 'cache',
                defaults: { ttl: 3600 },
                async setup(options) {
                    setupFn(options);
                },
            });

            const app = new Application();
            app.addModule(CreateModule());
            await app.setup();

            expect(setupFn).toHaveBeenCalledWith({ ttl: 3600 });
        });

        it('should merge overrides with defaults', async () => {
            const setupFn = vi.fn();

            const CreateModule = defineModule<{ driver: string; ttl: number }>({
                name: 'cache',
                defaults: { driver: 'memory', ttl: 3600 },
                async setup(options) {
                    setupFn(options);
                },
            });

            const app = new Application();
            app.addModule(CreateModule({ driver: 'redis' }));
            await app.setup();

            expect(setupFn).toHaveBeenCalledWith({ driver: 'redis', ttl: 3600 });
        });

        it('should disable module when false is passed', async () => {
            const setupFn = vi.fn();

            const CreateModule = defineModule<{ ttl: number }>({
                name: 'cache',
                defaults: { ttl: 3600 },
                async setup(options) {
                    setupFn(options);
                },
            });

            const app = new Application();
            app.addModule(CreateModule(false));
            await app.setup();

            expect(setupFn).not.toHaveBeenCalled();
        });

        it('should preserve dependencies', async () => {
            const order: string[] = [];

            const CreateA = defineModule<{ label: string }>({
                name: 'a',
                defaults: { label: 'a' },
                async setup(options) {
                    order.push(options.label);
                },
            });

            const CreateB = defineModule<{ label: string }>({
                name: 'b',
                defaults: { label: 'b' },
                dependencies: ['a'],
                async setup(options) {
                    order.push(options.label);
                },
            });

            const app = new Application();
            app.addModule(CreateB());
            app.addModule(CreateA());
            await app.setup();

            expect(order).toEqual(['a', 'b']);
        });

        it('should pass options to teardown', async () => {
            const teardownFn = vi.fn();

            const CreateModule = defineModule<{ ttl: number }>({
                name: 'cache',
                defaults: { ttl: 3600 },
                async setup() { /* noop */ },
                async teardown(options) {
                    teardownFn(options);
                },
            });

            const app = new Application();
            app.addModule(CreateModule({ ttl: 600 }));
            await app.setup();
            await app.teardown();

            expect(teardownFn).toHaveBeenCalledWith({ ttl: 600 });
        });

        it('should not include teardown when not defined', () => {
            const CreateModule = defineModule<{ ttl: number }>({
                name: 'test',
                defaults: { ttl: 0 },
                async setup() { /* noop */ },
            });

            const mod = CreateModule();
            expect(mod.teardown).toBeUndefined();
        });

        it('should pass container to setup and teardown', async () => {
            let setupContainer: IContainer | undefined;
            let teardownContainer: IContainer | undefined;

            const CreateModule = defineModule<{ ttl: number }>({
                name: 'test',
                defaults: { ttl: 0 },
                async setup(_options, container) {
                    setupContainer = container;
                },
                async teardown(_options, container) {
                    teardownContainer = container;
                },
            });

            const app = new Application();
            app.addModule(CreateModule());
            await app.setup();
            await app.teardown();

            expect(setupContainer).toBe(app.container);
            expect(teardownContainer).toBe(app.container);
        });

        it('should strip dependencies on disabled module', () => {
            const CreateModule = defineModule<{ ttl: number }>({
                name: 'test',
                defaults: { ttl: 0 },
                dependencies: ['other'],
                async setup() { /* noop */ },
            });

            const mod = CreateModule(false);
            expect(mod.dependencies).toBeUndefined();
        });
    });

    describe('ModuleFactoryDefinition', () => {
        it('should create a module via factory with defaults', async () => {
            const setupFn = vi.fn();

            class CacheModule implements IModule {
                name = 'cache';

                constructor(private options: { ttl: number }) {}

                async setup() {
                    setupFn(this.options);
                }
            }

            const CreateCache = defineModule<{ ttl: number }>({
                defaults: { ttl: 3600 },
                factory: (options) => new CacheModule(options),
            });

            const app = new Application();
            app.addModule(CreateCache());
            await app.setup();

            expect(setupFn).toHaveBeenCalledWith({ ttl: 3600 });
        });

        it('should merge overrides with defaults via factory', async () => {
            const setupFn = vi.fn();

            const CreateModule = defineModule<{ driver: string; ttl: number }>({
                defaults: { driver: 'memory', ttl: 3600 },
                factory: (options) => ({
                    name: 'cache',
                    async setup() { setupFn(options); },
                }),
            });

            const app = new Application();
            app.addModule(CreateModule({ driver: 'redis' }));
            await app.setup();

            expect(setupFn).toHaveBeenCalledWith({ driver: 'redis', ttl: 3600 });
        });

        it('should disable factory module when false is passed', async () => {
            const setupFn = vi.fn();

            const CreateModule = defineModule<{ ttl: number }>({
                defaults: { ttl: 3600 },
                factory: (options) => ({
                    name: 'cache',
                    async setup() { setupFn(options); },
                }),
            });

            const app = new Application();
            app.addModule(CreateModule(false));
            await app.setup();

            expect(setupFn).not.toHaveBeenCalled();
        });

        it('should preserve IModule properties from factory', async () => {
            const order: string[] = [];

            const CreateModule = defineModule<{ label: string }>({
                defaults: { label: 'test' },
                factory: (options) => ({
                    name: 'test',
                    dependencies: ['other'],
                    async setup() { order.push(options.label); },
                    async teardown() { order.push(`teardown:${options.label}`); },
                }),
            });

            const mod = CreateModule();
            expect(mod.name).toBe('test');
            expect(mod.dependencies).toEqual(['other']);
        });
    });
});
