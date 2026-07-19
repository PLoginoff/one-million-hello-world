# Contributing Guide

## Getting Started

1. Clone the repository
2. Run `npm install`
3. Run `npm test` to verify everything works
4. Create a feature branch: `git checkout -b feature/your-feature`

## Development Workflow

### Code Style
- TypeScript strict mode enabled
- ESLint with `@typescript-eslint` plugin
- Prettier for formatting (run `npm run lint:fix`)
- No `any` types without explicit justification
- Use interfaces for all public contracts

### Testing
- Write tests for all new code
- Follow AAA pattern (Arrange, Act, Assert)
- No shared state between tests
- Run `npm test` before committing

### Layer Structure
Each layer follows this structure:
```
src/layers/<layer-name>/
├── interfaces/       # I<Layer>.ts
├── implementations/  # <Layer>.ts
├── types/            # <layer>-types.ts
├── domain/
│   ├── entities/     # <Layer>Entity.ts
│   ├── value-objects/# <Layer>ValueObject.ts
│   └── services/     # <Layer>DomainService.ts
├── strategies/       # Strategy pattern implementations
├── factories/        # Factory classes
├── adapters/         # Adapter implementations
├── configuration/    # Builders, defaults, validators
├── health/           # HealthCheck
├── metrics/          # PrometheusMetricsCollector
├── statistics/       # MetricsCollector
├── utils/            # Error, ErrorMapper
├── __tests__/        # Unit tests
└── docs/             # Architecture, ADR, testing, configuration
```

### Adding a New Layer

1. Use the generator script:
   ```bash
   node scripts/generate-new-layers.js
   ```

2. Or manually create the layer following the structure above

3. Register in `src/application/LayerRegistry.ts`

4. Add tests and documentation

5. Run verification:
   ```bash
   npm run type-check
   npm run lint
   npm test
   ```

### Commit Messages

Follow conventional commits:
```
feat(<scope>): <description>
fix(<scope>): <description>
docs(<scope>): <description>
test(<scope>): <description>
refactor(<scope>): <description>
```

### Pull Request Process

1. Ensure all tests pass: `npm test`
2. Ensure type check passes: `npm run type-check`
3. Ensure lint passes: `npm run lint`
4. Update documentation if needed
5. Create PR with clear description
6. Request review from maintainers

## Architecture Principles

1. **Single Responsibility:** Each layer does one thing well
2. **Interface Segregation:** Layers communicate through interfaces
3. **Dependency Inversion:** Depend on abstractions, not concretions
4. **Open/Closed:** Open for extension, closed for modification
5. **DRY:** Don't repeat yourself — share utilities across layers
6. **YAGNI:** Don't add layers that aren't needed yet

## Questions?

- Check existing ADRs in `docs/adr/`
- Review layer architecture docs in each layer's `docs/` folder
- Open an issue for discussion
