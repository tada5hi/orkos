import { describe, expect, it, vi } from 'vitest';
import type { IContainer } from 'eldin';
import { Application, defineModule } from '../../src';

describe('defineModule', () => {
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

    it('should preserve dependsOn', async () => {
        const order: string[] = [];

        const CreateA = defineModule({
            name: 'a',
            async setup() {
                order.push('a');
            },
        });

        const CreateB = defineModule({
            name: 'b',
            dependsOn: ['a'],
            async setup() {
                order.push('b');
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
            async setup() {},
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
        const CreateModule = defineModule({
            name: 'test',
            async setup() {},
        });

        const mod = CreateModule();
        expect(mod.teardown).toBeUndefined();
    });

    it('should pass container to setup and teardown', async () => {
        let setupContainer: IContainer | undefined;
        let teardownContainer: IContainer | undefined;

        const CreateModule = defineModule({
            name: 'test',
            async setup(container) {
                setupContainer = container;
            },
            async teardown(container) {
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

    it('should disabled module strip dependsOn', () => {
        const CreateModule = defineModule({
            name: 'test',
            dependsOn: ['other'],
            async setup() {},
        });

        const mod = CreateModule(false);
        expect(mod.dependsOn).toBeUndefined();
    });
});
