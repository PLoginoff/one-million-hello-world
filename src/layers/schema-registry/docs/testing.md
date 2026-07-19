# Testing: SchemaRegistry Layer

## Unit Tests
- Implementation tests: SchemaRegistry.test.ts
- Domain tests: SchemaRegistryDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=schema-registry
```

## Integration Points
Test with adjacent layers using in-memory adapters.
