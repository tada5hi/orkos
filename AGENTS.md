# Orkos — Agent Guide

Orkos is a lightweight TypeScript library for orchestrating application modules with dependency-ordered startup and shutdown. It uses Kahn's topological sort algorithm to resolve module dependencies and integrates with the `eldin` dependency injection container.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build
npm test
npm run lint
npm run lint:fix
```

- **Runtime Node.js**: >= 22.0.0
- **Development Node.js**: 24.11+ on the 24.x line, or 26+; `.nvmrc` selects Node 24 for the installed tooling.
- **Package manager**: npm

## Detailed Guides


AGENTS.md is the loaded entry point and the guide index. Read the linked guides when working on their topics.
- **[Project Structure](.agents/structure.md)** — Source layout and module responsibilities
- **[Architecture](.agents/architecture.md)** — Orchestrator pattern, topological sort, and DI integration
- **[Testing](.agents/testing.md)** — Vitest setup, coverage thresholds, and test conventions
- **[Conventions](.agents/conventions.md)** — Linting, commit standards, CI/CD, and release automation
### Writing agent docs

Keep the guides factual and focused on contracts a future change could silently break.

- Keep existing commands, paths and factual descriptions current. Add guide content only for an invariant or cross-cutting rule. Put defect stories and verification details in the PR, and user-facing changes in the documentation site or release notes.
- Keep subsystem detail in `.agents/topics/` and link it from the relevant guide; do not import topic files into `CLAUDE.md`.
- Describe current behavior and cite issues or PRs, rather than local plan files or a running history of completed work.
- `npm run lint` enforces the shared config's agent-doc size, import-budget and history checks. Preserve the critical contracts when splitting a guide.
