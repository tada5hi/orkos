# orkos 🎻

[![npm version][npm-version-src]][npm-version-href]
[![codecov][codecov-src]][codecov-href]
[![Master Workflow][workflow-src]][workflow-href]
[![Known Vulnerabilities][snyk-src]][snyk-href]
[![Conventional Commits][conventional-src]][conventional-href]

A lightweight modular application orchestrator for TypeScript.

Define modules with dependencies, and orkos starts them in the right order and stops them in reverse. Built on top of [eldin](https://github.com/tada5hi/eldin) for dependency injection.

**Table of Contents**

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Modules](#modules)
- [Dependency Ordering](#dependency-ordering)
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
import type { IModule, IContainer } from 'orkos';

class ConfigModule implements IModule {
    readonly name = 'config';

    async start(container: IContainer): Promise<void> {
        container.register(ConfigToken, { useValue: { port: 3000 } });
    }
}

class DatabaseModule implements IModule {
    readonly name = 'database';
    readonly dependsOn = ['config'];

    async start(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigToken);
        const db = new Database(config);
        await db.connect();
        container.register(DatabaseToken, { useValue: db });
    }

    async stop(container: IContainer): Promise<void> {
        const db = container.resolve(DatabaseToken);
        await db.disconnect();
    }
}

class HttpModule implements IModule {
    readonly name = 'http';
    readonly dependsOn = ['config', 'database'];

    async start(container: IContainer): Promise<void> {
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

// Starts in dependency order: config -> database -> http
await app.start();

// Stops in reverse: http -> database -> config
await app.stop();
```

## Modules

A module is any object implementing the `IModule` interface:

```typescript
interface IModule {
    readonly name: string;
    readonly dependsOn?: string[];

    start(container: IContainer): Promise<void>;
    stop?(container: IContainer): Promise<void>;
}
```

| Property | Description |
|----------|-------------|
| `name` | Unique identifier for the module |
| `dependsOn` | Array of module names that must start before this one |
| `start()` | Called during startup with the shared DI container |
| `stop()` | Optional cleanup, called during shutdown |

Modules receive the application's shared [eldin](https://github.com/tada5hi/eldin) container. Use it to register and resolve dependencies across modules.

## Dependency Ordering

orkos resolves module start order using topological sort (Kahn's algorithm):

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
await app.start();
```

### Circular Dependencies

Circular dependencies are detected and throw an `ApplicationError`:

```typescript
// Module A depends on B, B depends on A
// → ApplicationError: Circular module dependency detected involving: A, B
```

### Missing Dependencies

If a module declares a dependency on a module that isn't registered, the dependency is silently skipped. This allows optional modules.

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
| `start()` | Resolve dependency order and start all modules |
| `stop()` | Stop all modules in reverse start order |
| `container` | The shared [eldin](https://github.com/tada5hi/eldin) `IContainer` instance |

### Dynamic Module Registration

```typescript
const app = new Application();

app.addModule(new ConfigModule());
app.addModule(new DatabaseModule());
app.addModules([new HttpModule(), new CacheModule()]);

await app.start();
```

## Usage with eldin

orkos uses [eldin](https://github.com/tada5hi/eldin) for dependency injection. Define typed tokens with eldin and use them across modules:

```typescript
import { TypedToken } from 'eldin';
import { Application } from 'orkos';

const ConfigToken = new TypedToken<Config>('Config');
const DatabaseToken = new TypedToken<Database>('Database');

class ConfigModule implements IModule {
    readonly name = 'config';

    async start(container) {
        container.register(ConfigToken, {
            useValue: { host: 'localhost', port: 5432 },
        });
    }
}

class DatabaseModule implements IModule {
    readonly name = 'database';
    readonly dependsOn = ['config'];

    async start(container) {
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

await app.start();

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
