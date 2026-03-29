# Conventions

## Code Style

- **ESLint** with `@tada5hi/eslint-config` (shared config)
- Run `npm run lint` to check, `npm run lint:fix` to auto-fix
- TypeScript strict mode via `@tada5hi/tsconfig` base config
- ESM-only — no CommonJS exports

## Commit Messages

Conventional Commits enforced by Commitlint (`@tada5hi/commitlint-config`) + Husky pre-commit hooks.

Format: `type(scope): description`

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## Naming: Options vs Context

Use `*Options` for types containing only plain objects and scalars (strings, numbers, booleans). Use `*Context` for types containing class instances, complex objects (Maps, arrays of complex types), or functions.

| Suffix | When to use | Examples |
|--------|-------------|---------|
| `*Options` | Plain scalars, simple config | `SetupOptions { resolveCache?: boolean }` |
| `*Context` | Class instances, Maps, functions, complex arrays | `ApplicationContext { container?: IContainer; modules?: ModuleInput[] }` |

If a type mixes both, the presence of any complex member tips it into `*Context`.

## Build

- **tsdown** compiles TypeScript to ESM (`dist/index.mjs` + `dist/index.d.mts`)
- Build command: `npm run build`
- Target: ES2022

## CI/CD

### Main workflow (`.github/workflows/main.yml`)
- Triggers on push/PR to `develop`, `master`, `next`, `beta`, `alpha`
- Parallel jobs after install: **build**, **lint**, **test**
- Node 22, caches `node_modules` and `dist/`

### Release workflow (`.github/workflows/release.yml`)
- Triggers on push to `master`
- Uses **release-please** for automated semver and changelog
- Tag format: `v{version}`

### Dependabot (`.github/dependabot.yml`)
- Daily checks for npm and GitHub Actions updates
- Groups major vs minor/patch updates
- Conventional Commits format for PR titles
