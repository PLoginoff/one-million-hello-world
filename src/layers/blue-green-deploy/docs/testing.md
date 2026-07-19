# Testing: BlueGreenDeploy Layer

## Unit Tests
- Implementation tests: BlueGreenDeploy.test.ts
- Domain tests: BlueGreenDeployDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=blue-green-deploy
```

## Integration Points
Test with adjacent layers using in-memory adapters.
