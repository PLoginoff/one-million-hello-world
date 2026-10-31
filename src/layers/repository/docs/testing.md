# Testing Strategy

Each layer can be tested independently:
- Unit tests for each implementation
- Interface-based mocking for dependencies
- Integration tests for layer interactions
- End-to-end tests through facade

## Test Coverage

The layer's engines are covered with `bun:test`:

### Running Tests
```bash
bun test ./src/layers/repository/
```

### Test Files Location
- `__tests__/` — base layer tests (CRUD, configuration, statistics)
- `engine/__tests__/ShardingEngine.test.ts` — shard routing, cross-shard queries, replica selection, query plan analysis, data masking, rebalancing
- `engine/__tests__/engine.test.ts` — specification compilation, cursor pagination, versioned store, query metrics

### Test Features
- Comprehensive test coverage for all engine functionality
- Detailed comments explaining each test case and assertion
- Edge case testing
- Configuration option testing
- Statistics tracking verification
- Error handling validation
