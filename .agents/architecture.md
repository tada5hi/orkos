# Architecture

## Core Pattern: Module Orchestrator

Orkos implements an orchestrator that manages module lifecycle through dependency-ordered execution.

### Module Interface

Every module implements `IModule`:

```typescript
interface IModule {
    readonly name: string;
    readonly dependsOn?: string[];
    start(container: IContainer): Promise<void>;
    stop?(container: IContainer): Promise<void>;
}
```

- `name` — unique identifier for dependency references
- `dependsOn` — array of module names that must start before this module
- `start()` — receives the shared DI container; called in dependency order
- `stop()` — optional cleanup; called in reverse dependency order

### Application Lifecycle

```
addModule(s) → start() → resolveOrder() → sequential start per module
                                        → stop() → reverse-order stop per module
```

1. **Registration** — Modules stored in a `Map<string, IModule>` for O(1) lookup
2. **Resolution** — `resolveOrder()` uses Kahn's topological sort:
   - Build adjacency list and in-degree map from `dependsOn` declarations
   - Seed queue with zero-in-degree modules
   - Process queue, decrementing dependents' in-degrees
   - If sorted count < total modules, throw `ApplicationError` (circular dependency)
3. **Start** — Iterate resolved order sequentially, calling `module.start(container)`
4. **Stop** — Iterate resolved order in reverse, calling `module.stop(container)`

### Dependency Injection Integration

The `Application` class wraps an `eldin` `Container` instance. The same container is passed to every module's `start()` and `stop()`, allowing modules to register and resolve services through a shared DI context.

```typescript
const app = new Application();
app.addModule(databaseModule);   // registers DB connection in container
app.addModule(httpModule);       // resolves DB from container, dependsOn: ['database']
await app.start();
```

### Unimplemented

- `reset()` — declared in `IApplication` but currently a no-op (`// todo` in `application.ts`)

### Error Handling

- `ApplicationError` is thrown when circular dependencies are detected during `resolveOrder()`
- The error message includes the names of modules involved in the cycle
