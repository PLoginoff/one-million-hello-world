# Testing: Backup Layer

## Unit Tests
- Implementation tests: Backup.test.ts
- Domain tests: BackupDomain.test.ts

## Test Coverage
- Happy path: execute() returns success result
- Configuration: configure() updates status
- Status: getStatus() returns layer info
- Domain entity: create, update, immutability
- Value object: create, equality, toString
- Domain service: validate, merge

## Running Tests
```bash
npx jest --testPathPattern=backup
```

## Integration Points
Test with adjacent layers using in-memory adapters.
