# orkos 🎻

[![npm version][npm-version-src]][npm-version-href]
[![codecov][codecov-src]][codecov-href]
[![Master Workflow][workflow-src]][workflow-href]
[![Known Vulnerabilities][snyk-src]][snyk-href]
[![Conventional Commits][conventional-src]][conventional-href]

A lightweight modular application orchestrator for TypeScript.

Define modules with dependencies, and orkos sets them up in the right order and tears them down in reverse. Built on top of [eldin](https://github.com/tada5hi/eldin) for dependency injection.

## Core Philosophy

Application startup is deceptively complex: services depend on each other, initialization order matters, and teardown must reverse that order reliably. orkos handles this with a single, explicit pattern — modules declare their dependencies, and a topological sort determines the rest. No implicit wiring, no decorator magic, no runtime surprises. The shared [eldin](https://github.com/tada5hi/eldin) container gives modules a clean way to exchange services without tight coupling.

**Table of Contents**

- [Core Philosophy](#core-philosophy)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Modules](#modules)
- [defineModule](#definemodule)
- [External Modules](#external-modules)
- [Dependency Ordering](#dependency-ordering)
- [Module Lifecycle](#module-lifecycle)
- [Application API](#application-api)
- [Error Handling](#error-handling)
- [Usage with eldin](#usage-with-eldin)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install orkos eldin --save
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
    readonly dependencies = ['config'];

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
    readonly dependencies = ['config', 'database'];

    async setup(container: IContainer): Promise<void> {
        const config = container.resolve(ConfigToken);
        const server = createServer(config.port);
        await server.listen();
    }
}

const app = new Application({
    modules: [
        new ConfigModule(),
        new DatabaseModule(),
        new HttpModule(),
    ],
});

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
    readonly version?: string;
    readonly dependencies?: (string | ModuleDependency)[];

    setup(container: IContainer): Promise<void>;
    teardown?(container: IContainer): Promise<void>;

    onReady?(container: IContainer): Promise<void>;
    onError?(error: Error, container: IContainer): Promise<void>;
}
```

| Property | Description |
|----------|-------------|
| `name` | Unique identifier for the module |
| `version` | Optional semver version string |
| `dependencies` | Array of module names or `ModuleDependency` objects |
| `setup()` | Called during startup with the shared DI container |
| `teardown()` | Optional cleanup, called during shutdown |
| `onReady()` | Called after all modules have been set up successfully |
| `onError()` | Called when this module's `setup()` throws an error |

Modules receive the application's shared [eldin](https://github.com/tada5hi/eldin) container. Use it to register and resolve dependencies across modules.

### ModuleDependency

Dependencies can be plain strings (module names) or objects with additional constraints:

```typescript
interface ModuleDependency {
    name: string;         // module name to depend on
    version?: string;     // semver range (e.g. '>=2.0.0', '^1.3.0')
    optional?: boolean;   // skip silently if not registered or resolvable
    package?: string;     // npm package name, if different from the module name
}
```

Examples:

```typescript
const dependencies = [
    'config',                                          // simple: depend on module named 'config'
    { name: 'database', version: '>=2.0.0' },         // require database v2+
    { name: 'cache', optional: true },                 // skip if cache isn't available
    { name: 'redis', package: '@myorg/orkos-redis' },  // resolve from a different package name
];
```

The `package` field is used during [external module resolution](#external-modules) — it tells orkos which npm package to `import()` when the module isn't already registered. Without it, orkos uses the `name` as both the module name and the package name.

## defineModule

The `defineModule` helper provides a convenient way to create configurable modules with typed options and defaults.

### Inline Definition

```typescript
import { defineModule } from 'orkos';

const CacheModule = defineModule<{ driver: 'memory' | 'redis'; ttl: number }>({
    name: 'cache',
    dependencies: ['config'],
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

const app = new Application({
    modules: [
        CacheModule(),                           // use defaults
        CacheModule({ driver: 'redis' }),        // override driver, keep ttl default
        CacheModule(false),                      // disable (no-op)
    ],
});
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

const app = new Application({
    modules: [
        createCacheModule(),
        createCacheModule({ driver: 'redis' }),
    ],
});
```

## External Modules

Modules can be referenced by npm package name and resolved automatically via dynamic `import()`. This is useful for sharing modules across projects as npm packages.

### Referencing External Modules

Pass a string (package name) or a `[string, options]` tuple anywhere you'd pass an `IModule`:

```typescript
const app = new Application({
    modules: [
        new ConfigModule(),                          // internal module (IModule)
        'orkos-redis',                               // external: resolve from node_modules
        ['orkos-redis', { host: '10.0.0.1' }],      // external with options
    ],
});

// Or via addModule:
app.addModule('orkos-redis');
app.addModule(['orkos-redis', { host: '10.0.0.1' }]);
```

External modules are resolved lazily — the `import()` call happens during `setup()`, not at registration time. This keeps `addModule()` synchronous.

### Package Convention

An orkos-compatible npm package must export a **default export** that is either a `ModuleFactory` (function) or an `IModule` (object).

**Factory export** (recommended — supports options):

```typescript
// orkos-redis/src/index.ts
import { defineModule } from 'orkos';

export default defineModule<{ host: string; port: number }>({
    name: 'orkos-redis',
    defaults: { host: 'localhost', port: 6379 },
    async setup(options, container) {
        const client = createRedisClient(options);
        container.register(RedisToken, { useValue: client });
    },
    async teardown(options, container) {
        const client = container.resolve(RedisToken);
        await client.disconnect();
    },
});
```

**Plain IModule export** (no options support):

```typescript
// orkos-metrics/src/index.ts
import type { IModule } from 'orkos';

const metricsModule: IModule = {
    name: 'orkos-metrics',
    async setup(container) {
        // initialize metrics collection
    },
};

export default metricsModule;
```

When orkos imports a package:

- **Function** → calls it as a `ModuleFactory` with provided options (or no args)
- **Object with `name` and `setup`** → uses it directly as an `IModule`
- **Anything else** → throws `INVALID_MODULE_EXPORT`

> **Name matching:** The module's `name` must match the package name used to reference it. If you add `'orkos-redis'`, the exported module must have `name: 'orkos-redis'`. A mismatch throws `INVALID_MODULE_EXPORT`. To use a different module name, declare the mapping via the [`package` field](#moduledependency) in a `ModuleDependency`.

### End-to-End Example

**Package author** publishes `orkos-redis`:

```typescript
// orkos-redis/src/index.ts
import { defineModule } from 'orkos';

export default defineModule<{ url: string }>({
    name: 'orkos-redis',
    defaults: { url: 'redis://localhost:6379' },
    async setup(options, container) {
        const client = new RedisClient(options.url);
        await client.connect();
        container.register(RedisToken, { useValue: client });
    },
    async teardown(options, container) {
        const client = container.resolve(RedisToken);
        await client.disconnect();
    },
});
```

**Consumer** uses it in their application:

```typescript
import { Application } from 'orkos';

const app = new Application({
    modules: [
        new ConfigModule(),
        ['orkos-redis', { url: 'redis://prod:6379' }],  // resolved via import('orkos-redis')
        new AuthModule(),                                 // can depend on 'orkos-redis'
    ],
});

await app.setup();
```

### Dependency Resolution Flow

When `setup()` is called, orkos resolves modules in this order:

1. **Resolve explicit externals** — strings and tuples passed to `addModule` or the constructor
2. **Scan dependencies** — check each resolved module's `dependencies` for unregistered names
3. **Auto-resolve missing deps** — attempt `import(name)` (or `import(package)` if the `package` field is set)
4. **Repeat recursively** — newly resolved modules may have their own unresolved dependencies
5. **Topological sort** — once all modules are resolved, determine setup order
6. **Throw on failure** — if a non-optional dependency can't be found after auto-resolution, throw `MODULE_NOT_FOUND`

Optional dependencies (`optional: true`) are silently skipped if they can't be resolved.

The recursive resolution has a configurable depth limit (`maxResolveDepth`, default 10) to prevent runaway chains.

### Auto-Install

By default, missing packages throw an error with a helpful install command:

```
ApplicationError: Module "orkos-redis" could not be resolved. Run: npm install orkos-redis
```

Enable `autoInstall` to install them automatically via [@antfu/install-pkg](https://github.com/antfu-collective/install-pkg):

```typescript
const app = new Application({
    autoInstall: true,   // attempts npm install before throwing
    modules: ['orkos-redis'],
});
```

### Re-Resolution

External modules are cached after first resolution. Subsequent `setup()` calls reuse the cached modules. To force a fresh `import()` of all previously resolved externals (e.g. during development):

```typescript
await app.setup({ resolveCache: false });
```

This removes all previously resolved external modules and re-imports them.

## Dependency Ordering

orkos resolves module setup order using topological sort (Kahn's algorithm):

```typescript
const app = new Application({
    modules: [
        new HttpModule(),      // dependencies: ['config', 'database']
        new ConfigModule(),    // no dependencies
        new DatabaseModule(),  // dependencies: ['config']
    ],
});

// Registration order doesn't matter — orkos resolves:
// 1. config (no deps)
// 2. database (depends on config)
// 3. http (depends on config + database)
await app.setup();
```

### Circular Dependencies

Circular dependencies are detected and throw an `ApplicationError` with code `CIRCULAR_DEPENDENCY`:

```typescript
// Module A depends on B, B depends on A
// → ApplicationError: Circular module dependency detected involving: A, B
```

### Missing Dependencies

When a module declares a dependency that isn't registered, orkos first attempts [auto-resolution](#dependency-resolution-flow) from `node_modules`. If the dependency still can't be found:

- **Non-optional** — `setup()` throws an `ApplicationError` with code `MODULE_NOT_FOUND`
- **Optional** (`optional: true`) — the dependency is silently skipped

## Module Lifecycle

### Versioning

Modules can declare a `version` and dependents can enforce semver constraints via [`ModuleDependency`](#moduledependency):

```typescript
class DatabaseModule implements IModule {
    readonly name = 'database';
    readonly version = '2.3.0';
    // ...
}

class AuthModule implements IModule {
    readonly name = 'auth';
    readonly dependencies = [
        { name: 'database', version: '>=2.0.0' },  // requires database v2+
    ];
    // ...
}
```

Supported ranges: `>=`, `>`, `<=`, `<`, `~`, `^`, and exact match. If a constraint is not satisfied, `setup()` throws an `ApplicationError` with code `VERSION_MISMATCH`.

### Hooks

**`onReady(container)`** — Called after **all** modules have been set up successfully, in dependency order. Use it for tasks that require the full application to be initialized (e.g. starting background jobs).

**`onError(error, container)`** — Called when this module's `setup()` throws. The original error is re-thrown after the hook runs. On failure, orkos automatically tears down any modules that were already set up successfully, in reverse order.

### Status Tracking

Each module moves through a lifecycle: `Pending → SettingUp → Ready` (or `Failed`), and `TearingDown → TornDown`. Query state via `getModuleStatus(name)` or `getStatus()` for the full map.

## Application API

```typescript
import { Application } from 'orkos';
import type { IApplication, ApplicationContext, SetupOptions } from 'orkos';

const app: IApplication = new Application({
    modules: [...],
    container: myContainer,    // optional: pre-configured eldin container
    autoInstall: false,        // optional: auto-install missing packages
    maxResolveDepth: 10,       // optional: recursive resolution depth limit
});
```

| Method | Description |
|--------|-------------|
| `addModule(module)` | Register a module (`IModule`, string, or `[string, options]` tuple) |
| `addModules(modules)` | Register multiple modules at once |
| `setup(options?)` | Resolve externals, sort dependencies, and set up all modules |
| `teardown()` | Tear down all modules in reverse setup order |
| `getModuleStatus(name)` | Get the current status of a module |
| `getStatus()` | Get a map of all module statuses |
| `container` | The shared [eldin](https://github.com/tada5hi/eldin) `IContainer` instance |

`setup()` accepts an optional `SetupOptions` object:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolveCache` | `boolean` | `true` | When `false`, re-imports all previously resolved external modules |

### Dynamic Module Registration

```typescript
const app = new Application();

app.addModule(new ConfigModule());
app.addModule('orkos-redis');
app.addModule(['orkos-cache', { ttl: 60 }]);
app.addModules([new HttpModule(), new CacheModule()]);

await app.setup();
```

## Error Handling

orkos uses structured error codes via [ebec](https://github.com/tada5hi/ebec). All errors are instances of `ApplicationError` (extends `BaseError`) with a `code` property for programmatic handling:

```typescript
import { ApplicationError, ApplicationErrorCode } from 'orkos';
import { isBaseError } from 'ebec';

try {
    await app.setup();
} catch (error) {
    if (isBaseError(error) && error.code === ApplicationErrorCode.VERSION_MISMATCH) {
        // handle version mismatch
    }
}
```

| Code | When |
|------|------|
| `CIRCULAR_DEPENDENCY` | Circular module dependency detected |
| `MODULE_NOT_FOUND` | Required module/package not registered or resolvable |
| `INVALID_MODULE_EXPORT` | Package default export is not a valid `ModuleFactory` or `IModule` |
| `MODULE_INSTALL_FAILED` | Auto-install of a package failed |
| `OPTIONS_NOT_SUPPORTED` | Options passed to a package that exports `IModule` (not a factory) |
| `RESOLUTION_DEPTH_EXCEEDED` | Recursive resolution exceeded `maxResolveDepth` |
| `VERSION_MISMATCH` | Dependency version constraint not satisfied |
| `MODULE_NOT_REGISTERED` | `getModuleStatus()` called with unknown module name |

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
    readonly dependencies = ['config'];

    async setup(container: IContainer) {
        // Type-safe resolution — no manual generics needed
        const config = container.resolve(ConfigToken); // Config
        container.register(DatabaseToken, {
            useFactory: () => new Database(config),
        });
    }
}

const app = new Application({
    modules: [
        new ConfigModule(),
        new DatabaseModule(),
    ],
});

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
