# orkos 🎻

[![npm version][npm-version-src]][npm-version-href]
[![codecov][codecov-src]][codecov-href]
[![Master Workflow][workflow-src]][workflow-href]
[![Known Vulnerabilities][snyk-src]][snyk-href]
[![Conventional Commits][conventional-src]][conventional-href]

A lightweight modular application orchestrator for TypeScript.

Define modules with dependencies, and orkos sets them up in the right order and tears them down in reverse. Built on top of [eldin](https://github.com/tada5hi/eldin) for dependency injection.

**Table of Contents**

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Modules](#modules)
- [defineModule](#definemodule)
- [Dependency Ordering](#dependency-ordering)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Module Status](#module-status)
- [Application API](#application-api)
- [Usage with eldin](#usage-with-eldin)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install orkos --save
```

## Quick Start

```typescript
import { Application } from 'orkos';
import type { IModule } from 'orkos';
import type { IContainer } from 'eldin';

class ConfigModule implements IModule {
    readonly name = 'config';

    async setup(container: IContainer): Promise<void> {
        container.register(ConfigToken, { useValue: { port: 3000 } });
    }
}

class DatabaseModule implements IModule {
    readonly name = 'database';
    readonly dependsOn = ['config'];

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigToken);
        const db = new Database(config);
        await db.connect();
        container.register(DatabaseToken, { useValue: db });
    }

    async teardown(container: IContainer): Promise<void> {
        const db = container.resolve(DatabaseToken);
        await db.disconnect();
    }
}

class HttpModule implements IModule {
    readonly name = 'http';
    readonly dependsOn = ['config', 'database'];

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigToken);
        const server = createServer(config.port);
        await server.listen();
    }
}

const app = new Application([
    new ConfigModule(),
    new DatabaseModule(),
    new HttpModule(),
]);

// Sets up in dependency order: config -> database -> http
await app.setup();

// Tears down in reverse: http -> database -> config
await app.teardown();
```

## Modules

A module is any object implementing the `IModule` interface:

```typescript
interface IModule {
    readonly name: string;
    readonly dependsOn?: string[];

    setup(container: IContainer): Promise<void>;
    teardown?(container: IContainer): Promise<void>;

    onReady?(container: IContainer): Promise<void>;
    onError?(error: Error, container: IContainer): Promise<void>;
}
```

| Property | Description |
|----------|-------------|
| `name` | Unique identifier for the module |
| `dependsOn` | Array of module names that must be set up before this one |
| `setup()` | Called during startup with the shared DI container |
| `teardown()` | Optional cleanup, called during shutdown |
| `onReady()` | Called after all modules have been set up successfully |
| `onError()` | Called when this module's `setup()` throws an error |

Modules receive the application's shared [eldin](https://github.com/tada5hi/eldin) container. Use it to register and resolve dependencies across modules.

## defineModule

The `defineModule` helper provides a convenient way to create configurable modules with typed options and defaults.

### Inline Definition

```typescript
import { defineModule } from 'orkos';

const CacheModule = defineModule<{ driver: 'memory' | 'redis'; ttl: number }>({
    name: 'cache',
    dependsOn: ['config'],
    defaults: { driver: 'memory', ttl: 3600 },

    async setup(options, container) {
        // options is { driver, ttl } with defaults merged
        container.register(CacheToken, {
            useFactory: () => createCache(options),
        });
    },

    async teardown(options, container) {
        const cache = container.resolve(CacheToken);
        await cache.close();
    },
});

const app = new Application([
    CacheModule(),                           // use defaults
    CacheModule({ driver: 'redis' }),        // override driver, keep ttl default
    CacheModule(false),                      // disable (no-op)
]);
```

### Factory Definition

Wrap a class-based `IModule` implementation with options:

```typescript
import { defineModule } from 'orkos';

class CacheModule implements IModule {
    readonly name = 'cache';

    constructor(private options: { driver: string; ttl: number }) {}

    async setup(container: IContainer) {
        // use this.options
    }
}

const createCacheModule = defineModule<{ driver: string; ttl: number }>({
    defaults: { driver: 'memory', ttl: 3600 },
    factory: (options) => new CacheModule(options),
});

const app = new Application([
    createCacheModule(),
    createCacheModule({ driver: 'redis' }),
]);
```

## Dependency Ordering

orkos resolves module setup order using topological sort (Kahn's algorithm):

```typescript
const app = new Application([
    new HttpModule(),      // dependsOn: ['config', 'database']
    new ConfigModule(),    // no dependencies
    new DatabaseModule(),  // dependsOn: ['config']
]);

// Registration order doesn't matter — orkos resolves:
// 1. config (no deps)
// 2. database (depends on config)
// 3. http (depends on config + database)
await app.setup();
```

### Circular Dependencies

Circular dependencies are detected and throw an `ApplicationError`:

```typescript
// Module A depends on B, B depends on A
// → ApplicationError: Circular module dependency detected involving: A, B
```

### Missing Dependencies

If a module declares a dependency on a module that isn't registered, the dependency is silently skipped. This allows optional modules.

## Lifecycle Hooks

### onReady

Called after **all** modules have been set up successfully, in dependency order:

```typescript
const app = new Application([
    {
        name: 'metrics',
        async setup(container) { /* register metrics */ },
        async onReady(container) {
            // All modules are ready — safe to start background tasks
            startMetricsCollection();
        },
    },
]);
```

### onError

Called when this module's `setup()` throws. The original error is still re-thrown after the hook runs:

```typescript
const app = new Application([
    {
        name: 'database',
        async setup(container) {
            await connectToDb(); // might throw
        },
        async onError(error, container) {
            logger.error('Database setup failed', error);
        },
    },
]);
```

On setup failure, orkos automatically tears down any modules that were already set up successfully, in reverse order.

## Module Status

Track module lifecycle state with `getModuleStatus()` and `getStatus()`:

```typescript
import { ModuleStatus } from 'orkos';

const app = new Application([dbModule, httpModule]);

app.getModuleStatus('database'); // ModuleStatus.Pending

await app.setup();
app.getModuleStatus('database'); // ModuleStatus.Ready

await app.teardown();
app.getModuleStatus('database'); // ModuleStatus.TornDown
```

Possible statuses: `Pending`, `SettingUp`, `Ready`, `TearingDown`, `TornDown`, `Failed`.

## Application API

```typescript
import { Application } from 'orkos';
import type { IApplication } from 'orkos';

const app: IApplication = new Application();
```

| Method | Description |
|--------|-------------|
| `addModule(module)` | Register a single module |
| `addModules(modules)` | Register multiple modules at once |
| `setup()` | Resolve dependency order and set up all modules |
| `teardown()` | Tear down all modules in reverse setup order |
| `getModuleStatus(name)` | Get the current status of a module |
| `getStatus()` | Get a map of all module statuses |
| `container` | The shared [eldin](https://github.com/tada5hi/eldin) `IContainer` instance |

### Dynamic Module Registration

```typescript
const app = new Application();

app.addModule(new ConfigModule());
app.addModule(new DatabaseModule());
app.addModules([new HttpModule(), new CacheModule()]);

await app.setup();
```

## Usage with eldin

orkos uses [eldin](https://github.com/tada5hi/eldin) for dependency injection. Define typed tokens with eldin and use them across modules:

```typescript
import { TypedToken } from 'eldin';
import type { IContainer } from 'eldin';
import { Application } from 'orkos';
import type { IModule } from 'orkos';

const ConfigToken = new TypedToken<Config>('Config');
const DatabaseToken = new TypedToken<Database>('Database');

class ConfigModule implements IModule {
    readonly name = 'config';

    async setup(container: IContainer) {
        container.register(ConfigToken, {
            useValue: { host: 'localhost', port: 5432 },
        });
    }
}

class DatabaseModule implements IModule {
    readonly name = 'database';
    readonly dependsOn = ['config'];

    async setup(container: IContainer) {
        // Type-safe resolution — no manual generics needed
        const config = container.resolve(ConfigToken); // Config
        container.register(DatabaseToken, {
            useFactory: () => new Database(config),
        });
    }
}

const app = new Application([
    new ConfigModule(),
    new DatabaseModule(),
]);

await app.setup();

// Access the container directly
const db = app.container.resolve(DatabaseToken); // Database
```

## Contributing

Before starting to work on a pull request, it is important to review the guidelines for
[contributing](./CONTRIBUTING.md) and the [code of conduct](./CODE_OF_CONDUCT.md).
These guidelines will help to ensure that contributions are made effectively and are accepted.

## License

Made with 💚

Published under [MIT License](./LICENSE).

[npm-version-src]: https://badge.fury.io/js/orkos.svg
[npm-version-href]: https://npmjs.com/package/orkos
[codecov-src]: https://codecov.io/gh/tada5hi/orkos/branch/master/graph/badge.svg?token=4KNSG8L13V
[codecov-href]: https://codecov.io/gh/tada5hi/orkos
[workflow-src]: https://github.com/tada5hi/orkos/workflows/CI/badge.svg
[workflow-href]: https://github.com/tada5hi/orkos
[snyk-src]: https://snyk.io/test/github/tada5hi/orkos/badge.svg?targetFile=package.json
[snyk-href]: https://snyk.io/test/github/tada5hi/orkos?targetFile=package.json
[conventional-src]: https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white
[conventional-href]: https://conventionalcommits.org
