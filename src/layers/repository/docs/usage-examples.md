# Usage Examples

All examples use the current `engine/` API. The legacy `components/` tree
has been removed — its responsibilities (data access, caching, transactions,
query parsing, filtering, sorting, pagination) are now covered by
`RepositoryEngine`, `VersionedStore`, `SpecCompiler`, and `CursorPaginator`.

## Repository Engine — Basic CRUD

```typescript
import { RepositoryEngine, StoredEntity } from './engine';

interface User extends StoredEntity {
  name: string;
  email: string;
}

const repo = new RepositoryEngine<User>({ /* store options */ });

// Create (version is assigned automatically)
const created = repo.insert({ id: 'u-1', name: 'John', email: 'john@example.com' });

// Read
const user = repo.get('u-1');

// Update with optimistic locking — throws on version conflict
repo.update('u-1', 1, { name: 'Jane' });

// Soft delete (hidden from queries, restorable)
repo.softDelete('u-1', 2);
```

## Specification Queries

```typescript
import { Spec, FieldBuilder } from './engine';

const f = new FieldBuilder<User>();
const spec = Spec.and(
  f.equals('name', 'Jane'),
  Spec.or(f.matches('email', /@example\.com$/), f.greaterThan('age', 18))
);

const results = repo.query(spec); // compiled to a predicate + SQL fragment
```

## Cursor Pagination

```typescript
import { CursorPaginator } from './engine';

const paginator = new CursorPaginator<User>(25 /* page size */);
const page1 = paginator.paginate(repo.all(), /* cursor */ undefined);
const page2 = paginator.paginate(repo.all(), page1.nextCursor);
```

## Sharded Repository

```typescript
import { ShardingEngine } from './engine';

const sharded = new ShardingEngine<User>({
  shards: [{ id: 'shard-a', weight: 1 }, { id: 'shard-b', weight: 1 }],
  keyExtractor: u => u.id,
});

// Routed by consistent hash; cross-shard queries fan out and merge
sharded.insert(user);
const all = sharded.query(spec);
```

## Query Metrics

```typescript
import { QueryMetrics } from './engine';

const metrics = new QueryMetrics();
metrics.record('query', durationMs);
const snapshot = metrics.snapshot(); // p50 / p90 / p95 / p99
```

## Testing

```bash
bun test ./src/layers/repository/
```

See `testing.md` for the full suite layout.
