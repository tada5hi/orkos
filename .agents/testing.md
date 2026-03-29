# Testing

## Framework

Vitest 4.x with V8 coverage provider.

## Commands

```bash
npm test              # Run tests with coverage check (--run flag, no watch)
npm run test:coverage # Generate coverage report
```

## Configuration

Test config is at `test/vitest.config.ts`:

- **Test pattern**: `test/unit/**/*.{test,spec}.{js,ts}`
- **Coverage thresholds** (all 80%): branches, functions, lines, statements

## Test Files

| File | Coverage |
|------|----------|
| `application.spec.ts` | Module registration, dependency resolution, setup/teardown ordering, circular dependency detection |
| `lifecycle.spec.ts` | `onReady` and `onError` hooks |
| `status.spec.ts` | `ModuleStatus` tracking and partial teardown |
| `define.spec.ts` | `defineModule()` factory, defaults merging, disable via `false` |
| `versioning.spec.ts` | Semver dependency constraints and optional dependencies |
| `resolve.spec.ts` | External module resolution, recursive resolution, auto-install, error cases |
| `semver.spec.ts` | `satisfies()` utility with various range patterns |
| `error.spec.ts` | `ApplicationError` construction, `ebec` integration, error codes |

## Conventions

- Tests live in `test/unit/` mirroring the source structure
- Use `.spec.ts` extension
- Import from the source (`../../src/`) directly, not from built output
