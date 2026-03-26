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

## Current State

The existing test file (`test/unit/index.spec.ts`) is a placeholder that imports a non-existent `add` function. It needs to be rewritten to test the actual `Application` class.

## Conventions

- Tests live in `test/unit/` mirroring the source structure
- Use `.spec.ts` extension
- Import from the source (`../../src/`) directly, not from built output
