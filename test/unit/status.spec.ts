import { describe, expect, it } from 'vitest';
import { Application, ApplicationError, ModuleStatus } from '../../src';
import type { IModule } from '../../src';

function createModule(
    name: string,
    opts: {
        dependencies?: string[];
        setupFn?: () => Promise<void>;
        teardownFn?: () => Promise<void>;
    } = {},
): IModule {
    return {
        name,
        dependencies: opts.dependencies,
        async setup() {
            if (opts.setupFn) {
                await opts.setupFn();
            }
        },
        async teardown() {
            if (opts.teardownFn) {
                await opts.teardownFn();
            }
        },
    };
}

describe('Module Status Tracking', () => {
    describe('getModuleStatus', () => {
        it('should return pending for a registered module before setup', () => {
            const app = new Application({ modules: [createModule('a')] });
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.Pending);
        });

        it('should throw for an unregistered module name', () => {
            const app = new Application();
            expect(() => app.getModuleStatus('nonexistent')).toThrow(ApplicationError);
        });

        it('should return ready after successful setup', async () => {
            const app = new Application({ modules: [createModule('a')] });
            await app.setup();
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.Ready);
        });

        it('should return torn-down after teardown', async () => {
            const app = new Application({ modules: [createModule('a')] });
            await app.setup();
            await app.teardown();
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.TornDown);
        });

        it('should return failed for a module whose setup threw', async () => {
            const app = new Application({
                modules: [
                    createModule('a', {
                        setupFn: async () => { throw new Error('fail'); },
                    }),
                ],
            });
            await expect(app.setup()).rejects.toThrow('fail');
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.Failed);
        });
    });

    describe('getStatus', () => {
        it('should return a map of all module statuses', async () => {
            const app = new Application({
                modules: [
                    createModule('a'),
                    createModule('b', { dependencies: ['a'] }),
                ],
            });
            await app.setup();

            const status = app.getStatus();
            expect(status.get('a')).toBe(ModuleStatus.Ready);
            expect(status.get('b')).toBe(ModuleStatus.Ready);
        });

        it('should return a copy that does not affect internal state', async () => {
            const app = new Application({ modules: [createModule('a')] });
            const status = app.getStatus();
            status.set('a', ModuleStatus.Failed);
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.Pending);
        });
    });

    describe('status transitions during setup', () => {
        it('should transition through setting-up to ready', async () => {
            const observed: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', {
                        setupFn: async () => {
                            observed.push(app.getModuleStatus('a'));
                        },
                    }),
                ],
            });

            expect(app.getModuleStatus('a')).toBe(ModuleStatus.Pending);
            await app.setup();
            expect(observed).toEqual([ModuleStatus.SettingUp]);
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.Ready);
        });
    });

    describe('status transitions during teardown', () => {
        it('should transition through tearing-down to torn-down', async () => {
            const observed: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', {
                        teardownFn: async () => {
                            observed.push(app.getModuleStatus('a'));
                        },
                    }),
                ],
            });

            await app.setup();
            await app.teardown();
            expect(observed).toEqual([ModuleStatus.TearingDown]);
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.TornDown);
        });
    });

    describe('partial failure handling', () => {
        it('should only tear down modules in ready state on setup failure', async () => {
            const teardowns: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', {
                        teardownFn: async () => { teardowns.push('a'); },
                    }),
                    createModule('b', {
                        dependencies: ['a'],
                        teardownFn: async () => { teardowns.push('b'); },
                    }),
                    createModule('c', {
                        dependencies: ['b'],
                        setupFn: async () => { throw new Error('c failed'); },
                        teardownFn: async () => { teardowns.push('c'); },
                    }),
                ],
            });

            await expect(app.setup()).rejects.toThrow('c failed');
            expect(teardowns).toEqual(['b', 'a']);
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.TornDown);
            expect(app.getModuleStatus('b')).toBe(ModuleStatus.TornDown);
            expect(app.getModuleStatus('c')).toBe(ModuleStatus.Failed);
        });

        it('should not tear down pending modules after a failure', async () => {
            const teardowns: string[] = [];
            const app = new Application({
                modules: [
                    createModule('a', {
                        teardownFn: async () => { teardowns.push('a'); },
                    }),
                    createModule('b', {
                        dependencies: ['a'],
                        setupFn: async () => { throw new Error('b failed'); },
                        teardownFn: async () => { teardowns.push('b'); },
                    }),
                    createModule('c', {
                        dependencies: ['b'],
                        teardownFn: async () => { teardowns.push('c'); },
                    }),
                ],
            });

            await expect(app.setup()).rejects.toThrow('b failed');
            expect(teardowns).toEqual(['a']);
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.TornDown);
            expect(app.getModuleStatus('b')).toBe(ModuleStatus.Failed);
            expect(app.getModuleStatus('c')).toBe(ModuleStatus.Pending);
        });

        it('should mark module as torn-down even if teardown() throws', async () => {
            const app = new Application({
                modules: [
                    createModule('a', {
                        teardownFn: async () => { throw new Error('teardown failed'); },
                    }),
                ],
            });

            await app.setup();
            await app.teardown();
            expect(app.getModuleStatus('a')).toBe(ModuleStatus.TornDown);
        });
    });
});
