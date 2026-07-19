# Testing: WorkflowEngine Layer

## Unit Tests
- Implementation tests: WorkflowEngine.test.ts
- Domain tests: WorkflowEngineDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=workflow-engine
```

## Integration Points
Test with adjacent layers using in-memory adapters.
