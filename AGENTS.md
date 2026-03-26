<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

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

- **Node.js**: >= 22.0.0
- **Package manager**: npm

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — Source layout and module responsibilities
- **[Architecture](.agents/architecture.md)** — Orchestrator pattern, topological sort, and DI integration
- **[Testing](.agents/testing.md)** — Vitest setup, coverage thresholds, and test conventions
- **[Conventions](.agents/conventions.md)** — Linting, commit standards, CI/CD, and release automation
