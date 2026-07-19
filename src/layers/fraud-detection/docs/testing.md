# Testing: FraudDetection Layer

## Unit Tests
- Implementation tests: FraudDetection.test.ts
- Domain tests: FraudDetectionDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=fraud-detection
```

## Integration Points
Test with adjacent layers using in-memory adapters.
