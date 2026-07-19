# Testing: BotDetection Layer

## Unit Tests
- Implementation tests: BotDetection.test.ts
- Domain tests: BotDetectionDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=bot-detection
```

## Integration Points
Test with adjacent layers using in-memory adapters.
