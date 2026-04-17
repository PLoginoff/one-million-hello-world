# Usage Examples

## Data Access Layer Example
```typescript
import { DataAccess } from './components/data-access';
import { DomainEntity } from './domain/types';

interface User extends DomainEntity {
  id: string;
  name: string;
  email: string;
}

const dataAccess = new DataAccess<User>();

// Create entity
await dataAccess.create({
  id: '1',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Read entity
const user = await dataAccess.findById('1');

// Update entity
await dataAccess.update('1', {
  name: 'Jane Doe',
  updatedAt: new Date(),
});

// Delete entity
await dataAccess.delete('1');

// Bulk operations
await dataAccess.bulkCreate([...users]);
await dataAccess.bulkDelete(['1', '2', '3']);
```

## Cache Layer Example
```typescript
import { Cache } from './components/cache';
import { CacheEvictionPolicy } from './components/cache/types';

const cache = new Cache({
  maxSize: 1000,
  defaultTTL: 60000,
  evictionPolicy: CacheEvictionPolicy.LRU,
});

// Set value
await cache.set('user:1', { id: '1', name: 'John' });

// Get value
const user = await cache.get('user:1');

// Set with custom TTL
await cache.set('user:2', { id: '2', name: 'Jane' }, 300000);

// Invalidate by pattern
await cache.invalidate('user:*');

// Get statistics
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}`);
```

## Transaction Manager Example
```typescript
import { TransactionManager } from './components/transaction';
import { TransactionIsolationLevel } from './components/transaction/types';

const txManager = new TransactionManager();

// Begin transaction
const tx = await txManager.beginTransaction({
  isolationLevel: TransactionIsolationLevel.SERIALIZABLE,
  timeout: 30000,
});

// Execute operations within transaction
try {
  await txManager.executeOperation(tx.id, {
    type: 'write',
    data: { entity: 'user', operation: 'create' },
  });

  // Commit transaction
  await txManager.commit(tx.id);
} catch (error) {
  // Rollback on error
  await txManager.rollback(tx.id);
}
```

## Query Parser Example
```typescript
import { QueryParser } from './components/query-parser';

const parser = new QueryParser({
  allowedFields: ['name', 'email', 'age'],
  forbiddenFields: ['password'],
});

// Parse query string
const parsed = parser.parse('name=John&age>30&sort=name&limit=10');

// Validate query
const validation = parser.validate(parsed);
if (!validation.isValid) {
  console.error(validation.errors);
}

// Serialize query back to string
const queryString = parser.serialize(parsed);
```

## Filter Engine Example
```typescript
import { FilterEngine } from './components/filter-engine';

const filterEngine = new FilterEngine();

const data = [
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 },
  { name: 'Bob', age: 35 },
];

// Apply filter
const result = filterEngine.apply(data, {
  field: 'age',
  operator: 'gt',
  value: 28,
});

// Compile filter for performance
const compiled = filterEngine.compile({
  field: 'name',
  operator: 'eq',
  value: 'John',
});
const filtered = data.filter(compiled);
```

## Sort Engine Example
```typescript
import { SortEngine } from './components/sort-engine';

const sortEngine = new SortEngine();

const data = [
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 },
  { name: 'Bob', age: 35 },
];

// Single field sort
const sorted = sortEngine.apply(data, {
  field: 'age',
  direction: 'asc',
});

// Multi-level sort
const multiSorted = sortEngine.apply(data, [
  { field: 'name', direction: 'asc' },
  { field: 'age', direction: 'desc' },
]);
```

## Pagination Engine Example
```typescript
import { PaginationEngine } from './components/pagination-engine';

const paginationEngine = new PaginationEngine();

const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));

// Offset-based pagination
const page1 = paginationEngine.applyOffset(data, 0, 10);
const page2 = paginationEngine.applyOffset(data, 10, 10);

// Cursor-based pagination
const cursorPage = paginationEngine.applyCursor(data, 'item-5', 10, 'id');

// Get pagination info
const info = paginationEngine.getPaginationInfo(data, 0, 10);
console.log(`Total: ${info.total}, Pages: ${info.totalPages}`);
```

## Query Builder Example
```typescript
import { QueryBuilder } from './components/query-builder';

const queryBuilder = new QueryBuilder();

// Build complex query
const query = queryBuilder
  .where('name', 'eq', 'John')
  .andWhere('age', 'gt', 30)
  .orWhere('status', 'eq', 'active')
  .orderBy('name', 'asc')
  .limit(10)
  .offset(0)
  .build();

// Clone and modify
const modifiedQuery = queryBuilder
  .clone()
  .where('email', 'eq', 'john@example.com')
  .build();
```

## Validation Layer Example
```typescript
import { Validation } from './components/validation';

const validation = new Validation();

// Add validation rules
validation.addRule({
  field: 'email',
  validator: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  message: 'Invalid email format',
});

validation.addRule({
  field: 'age',
  validator: (value) => value >= 18,
  message: 'Age must be 18 or older',
});

// Validate entity
const result = validation.validate({
  email: 'john@example.com',
  age: 25,
});

if (!result.success) {
  console.error(result.errors);
}
```

## Middleware Layer Example
```typescript
import { Middleware } from './components/middleware';

const middleware = new Middleware();

// Add logging middleware
middleware.use(async (context, next) => {
  console.log(`Starting: ${context.operation}`);
  const result = await next(context);
  console.log(`Completed: ${context.operation}`);
  return result;
});

// Add error handling middleware
middleware.use(async (context, next) => {
  try {
    return await next(context);
  } catch (error) {
    console.error(`Error in ${context.operation}:`, error);
    return { success: false, error };
  }
});

// Execute middleware pipeline
await middleware.execute({ operation: 'find', metadata: {} });
```

## Metrics Layer Example
```typescript
import { Metrics } from './components/metrics';

const metrics = new Metrics();

// Counter metrics
metrics.increment('requests.total', 1);
metrics.decrement('connections.active', 1);

// Gauge metrics
metrics.gauge('memory.usage', 1024);
metrics.gauge('cpu.usage', 75);

// Histogram metrics
metrics.histogram('request.duration', 150);

// Timer metrics
await metrics.time('operation.time', async () => {
  // Execute operation
});

// Export metrics
const exported = metrics.export();
console.log(exported);
```

## Handler Layer Example
```typescript
import { Handler } from './components/handler';

const handler = new Handler();

// Create context
const context = handler.createContext('find', {
  userId: '123',
  requestId: 'abc',
});

// Handle operation
const result = await handler.handleFind(context);

// Add middleware
handler.use(async (context, next) => {
  console.log(`Handler: ${context.operation}`);
  return next(context);
});
```

## Repository Facade Example
```typescript
import { Facade } from './components/facade';

const facade = new Facade({
  enableCaching: true,
  enableTransactions: true,
});

// CRUD operations
const user = await facade.findById('1');
const users = await facade.find({ name: 'John' });
await facade.save({ id: '1', name: 'John' });
await facade.delete('1');

// Query builder
const queryBuilder = facade.getQueryBuilder();
const query = queryBuilder.where('name', 'eq', 'John').build();
const results = await facade.find(query);

// Transaction
const tx = await facade.beginTransaction();
try {
  await facade.save({ id: '1', name: 'John' });
  await facade.commitTransaction(tx.transactionId);
} catch (error) {
  await facade.rollbackTransaction(tx.transactionId);
}

// Get statistics
const stats = facade.getStats();
console.log(`Total operations: ${stats.totalOperations}`);
```
