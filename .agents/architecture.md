# Architecture

## Core Pattern: Module Orchestrator

Orkos implements an orchestrator that manages module lifecycle through dependency-ordered execution.

### Module Interface

Every module implements `IModule`:

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

- `name` — unique identifier for dependency references
- `version` — optional semver version string for dependency constraint validation
- `dependencies` — array of module names (strings) or `ModuleDependency` objects with version/optional constraints
- `setup()` — receives the shared DI container; called in dependency order
- `teardown()` — optional cleanup; called in reverse dependency order
- `onReady()` — optional hook called after all modules have been set up successfully
- `onError()` — optional hook called when an error occurs during setup

### Application Lifecycle

```
addModule(s) → setup() → resolveOrder() → sequential setup per module
                                        → teardown() → reverse-order teardown per module
```

1. **Registration** — Modules stored in a `Map<string, IModule>` for O(1) lookup
2. **Resolution** — `resolveOrder()` uses Kahn's topological sort:
   - Build adjacency list and in-degree map from `dependencies` declarations
   - Seed queue with zero-in-degree modules
   - Process queue, decrementing dependents' in-degrees
   - If sorted count < total modules, throw `ApplicationError` (circular dependency)
3. **Setup** — Iterate resolved order sequentially, calling `module.setup(container)`. After all modules are set up, `onReady()` is called on each module. If setup fails, `onError()` is called on the failing module.
4. **Teardown** — Iterate resolved order in reverse, calling `module.teardown(container)` only for modules with `Ready` status

### Dependency Injection Integration

The `Application` class wraps an `eldin` `Container` instance. The same container is passed to every module's `setup()` and `teardown()`, allowing modules to register and resolve services through a shared DI context.

```typescript
const app = new Application();
app.addModule(databaseModule);   // registers DB connection in container
app.addModule(httpModule);       // resolves DB from container, dependencies: ['database']
await app.setup();
```

### Module Status Tracking

Each module is tracked with a `ModuleStatus` enum: `Pending → SettingUp → Ready` (or `Failed`), and `TearingDown → TornDown`. Status can be queried via `app.getModuleStatus(name)` or `app.getStatus()`. Only modules with `Ready` status are torn down, enabling partial teardown on failure.

### Module Versioning

Modules can declare a `version` string. Dependencies can specify semver constraints via `ModuleDependency`:

```typescript
{ name: 'database', version: '>=2.0.0', optional: true }
```

Version constraints are validated during setup. Optional dependencies are skipped if not registered.

### defineModule Helper

`defineModule()` creates typed module factories with default options:

```typescript
const createCache = defineModule<{ ttl: number }>({
    name: 'cache',
    defaults: { ttl: 3600 },
    setup: async (options, container) => { /* ... */ },
});
app.addModule(createCache({ ttl: 600 }));
```

Passing `false` disables the module (returns a no-op module).

### Error Handling

- `ApplicationError` is thrown when circular dependencies are detected during `resolveOrder()` or when dependency version constraints are not satisfied
- The error message includes the names of modules involved
