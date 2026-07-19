# Testing: Bpmn Layer

## Unit Tests
- Implementation tests: Bpmn.test.ts
- Domain tests: BpmnDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=bpmn
```

## Integration Points
Test with adjacent layers using in-memory adapters.
