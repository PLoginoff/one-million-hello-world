# Domain Layer Documentation

## Overview

The Domain Layer contains the core business logic of the Cache Layer. It is independent of any infrastructure concerns and represents the fundamental building blocks of the caching system.

## Structure

```
domain/
├── entities/           # Domain entities
│   ├── CacheEntry.ts   # Cache entry entity
│   ├── CacheKey.ts     # Cache key entity
│   └── index.ts
├── value-objects/      # Value objects
│   ├── TTL.ts          # Time-to-live value object
│   ├── CacheLevel.ts   # Cache level value object
│   ├── CacheStats.ts   # Cache statistics value object
│   └── index.ts
├── services/           # Domain services
│   ├── CacheValidationService.ts
│   └── index.ts
└── index.ts
```

## Entities

### CacheEntry

Represents a single cache entry with metadata and access tracking.

```typescript
import { CacheEntry } from '../domain/entities/CacheEntry';

const entry = new CacheEntry('user:1', 'John Doe', 60000);

// Check if expired
if (entry.isExpired()) {
  // Entry has expired
}

// Record access
entry.recordAccess();

// Get time since last access
const timeSinceAccess = entry.getTimeSinceLastAccess();

// Clone entry
const cloned = entry.clone();
```

**Properties:**
- `key: string` - Cache key
- `value: T` - Cached value
- `ttl: number` - Time-to-live in milliseconds
- `createdAt: number` - Creation timestamp
- `accessCount: number` - Number of accesses
- `lastAccessedAt: number` - Last access timestamp

**Methods:**
- `isExpired(currentTime?: number): boolean` - Check if entry is expired
- `recordAccess(currentTime?: number): void` - Record access to entry
- `getTimeSinceLastAccess(currentTime?: number): number` - Get time since last access
- `clone(): CacheEntry<T>` - Create a copy of the entry

### CacheKey

Represents a cache key with validation and pattern matching capabilities.

```typescript
import { CacheKey } from '../domain/entities/CacheKey';

// Create regular key
const key = CacheKey.create('user:1');

// Create pattern key
const patternKey = CacheKey.fromPattern('user:*');

// Check pattern match
if (key.matches(/user:\d+/)) {
  // Key matches pattern
}

// Get hash
const hash = key.getHash();
```

**Properties:**
- `value: string` - Key value
- `pattern: RegExp | null` - Pattern if created from pattern

**Methods:**
- `create(value: string): CacheKey` - Create regular cache key
- `fromPattern(pattern: string): CacheKey` - Create key from pattern
- `matches(pattern: RegExp): boolean` - Check if key matches pattern
- `equals(other: CacheKey): boolean` - Check equality
- `toString(): string` - Get string representation
- `getHash(): number` - Get hash for quick comparisons

## Value Objects

### TTL

Represents time-to-live duration with unit conversion.

```typescript
import { TTL, TimeUnit } from '../domain/value-objects/TTL';

// Create with specific units
const ttl1 = TTL.seconds(60);
const ttl2 = TTL.minutes(5);
const ttl3 = TTL.hours(1);

// Convert to milliseconds
const ms = ttl1.toMilliseconds();

// Check if infinite
if (ttl1.isInfinite()) {
  // Never expires
}
```

**Static Methods:**
- `milliseconds(value: number): TTL` - Create TTL in milliseconds
- `seconds(value: number): TTL` - Create TTL in seconds
- `minutes(value: number): TTL` - Create TTL in minutes
- `hours(value: number): TTL` - Create TTL in hours

**Methods:**
- `toMilliseconds(): number` - Convert to milliseconds
- `isInfinite(): boolean` - Check if TTL is infinite (0)
- `withValue(value: number): TTL` - Create copy with new value

### CacheLevel

Represents cache hierarchy level with ordering.

```typescript
import { CacheLevel } from '../domain/value-objects/CacheLevel';

const l1 = CacheLevel.L1();
const l2 = CacheLevel.L2();
const l3 = CacheLevel.L3();

// Compare levels
if (l1.isHigherThan(l2)) {
  // L1 is higher priority than L2
}

// Create from string
const level = CacheLevel.fromString('L1');
```

**Static Methods:**
- `L1(): CacheLevel` - Create L1 cache level
- `L2(): CacheLevel` - Create L2 cache level
- `L3(): CacheLevel` - Create L3 cache level
- `fromString(value: string): CacheLevel` - Create from string

**Methods:**
- `isHigherThan(other: CacheLevel): boolean` - Check if higher priority
- `isLowerThan(other: CacheLevel): boolean` - Check if lower priority
- `toString(): string` - Get string representation

### CacheStats

Represents cache performance metrics with calculation methods.

```typescript
import { CacheStats } from '../domain/value-objects/CacheStats';

const stats = new CacheStats(100, 10, 5, 50);

// Calculate rates
const hitRate = stats.getHitRate(); // 0.909 (90.9%)
const missRate = stats.getMissRate(); // 0.091 (9.1%)

// Get total requests
const total = stats.getTotalRequests(); // 110

// Create with mutations
const withHit = stats.withHit();
const withMiss = stats.withMiss();
const withEviction = stats.withEviction();
const withSize = stats.withSize(100);

// Reset
const reset = stats.reset();

// Convert to JSON
const json = stats.toJSON();
```

**Properties:**
- `hits: number` - Number of cache hits
- `misses: number` - Number of cache misses
- `evictions: number` - Number of evictions
- `size: number` - Current cache size
- `createdAt: number` - Creation timestamp

**Methods:**
- `getHitRate(): number` - Calculate hit rate (0-1)
- `getMissRate(): number` - Calculate miss rate (0-1)
- `getTotalRequests(): number` - Get total requests
- `withHit(): CacheStats` - Create copy with incremented hits
- `withMiss(): CacheStats` - Create copy with incremented misses
- `withEviction(): CacheStats` - Create copy with incremented evictions
- `withSize(size: number): CacheStats` - Create copy with new size
- `reset(): CacheStats` - Reset all statistics
- `toJSON(): object` - Convert to plain object

## Domain Services

### CacheValidationService

Domain service for validating cache operations and data.

```typescript
import { CacheValidationService } from '../domain/services/CacheValidationService';

// Validate key
CacheValidationService.validateKey('user:1');

// Validate TTL
CacheValidationService.validateTTL(60000);

// Validate entry
CacheValidationService.validateEntry(entry);

// Validate size
CacheValidationService.validateSize(1000);

// Validate pattern
CacheValidationService.validatePattern('user:*');

// Check if valid for storage
if (CacheValidationService.isEntryValidForStorage(entry)) {
  // Entry is valid
}
```

**Static Methods:**
- `validateKey(key: string | CacheKey): void` - Validate cache key
- `validateTTL(ttl: number | TTL): void` - Validate TTL value
- `validateEntry<T>(entry: CacheEntry<T>): void` - Validate cache entry
- `validateSize(size: number): void` - Validate cache size
- `validatePattern(pattern: string): void` - Validate regex pattern
- `isEntryValidForStorage<T>(entry: CacheEntry<T>): boolean` - Check if valid for storage

## Design Principles

The Domain Layer follows these principles:

1. **Independence**: No dependencies on infrastructure or external layers
2. **Immutability**: Value objects are immutable
3. **Validation**: Domain rules enforced at the entity level
4. **Encapsulation**: Internal state protected, behavior exposed through methods
5. **Type Safety**: Full TypeScript support with generics

## Usage Examples

### Creating a Cache Entry

```typescript
import { CacheEntry, TTL } from '../domain';

const ttl = TTL.minutes(5);
const entry = new CacheEntry('user:1', userData, ttl.toMilliseconds());

if (!entry.isExpired()) {
  entry.recordAccess();
  console.log(`Accessed ${entry.accessCount} times`);
}
```

### Working with Cache Keys

```typescript
import { CacheKey } from '../domain/entities/CacheKey';

const key = CacheKey.create('product:12345');
const pattern = CacheKey.fromPattern('product:*');

if (key.matches(/product:\d+/)) {
  console.log('Valid product key');
}
```

### Calculating Statistics

```typescript
import { CacheStats } from '../domain/value-objects/CacheStats';

const stats = new CacheStats(950, 50, 10, 100);
console.log(`Hit rate: ${(stats.getHitRate() * 100).toFixed(2)}%`);
console.log(`Efficiency: ${stats.getTotalRequests()} requests`);
```

## Testing Domain Layer

Domain layer tests focus on business logic and validation:

```typescript
describe('CacheEntry', () => {
  it('should expire after TTL', () => {
    const entry = new CacheEntry('key', 'value', 100);
    expect(entry.isExpired(Date.now() + 150)).toBe(true);
  });

  it('should track access count', () => {
    const entry = new CacheEntry('key', 'value', 60000);
    entry.recordAccess();
    expect(entry.accessCount).toBe(1);
  });
});
```

## Best Practices

1. **Always use factory methods**: Use static methods like `CacheKey.create()` instead of constructors
2. **Validate early**: Use `CacheValidationService` before creating entities
3. **Treat value objects as immutable**: Always create new instances instead of modifying
4. **Use appropriate time units**: Use `TTL.seconds()` instead of raw milliseconds for clarity
5. **Check expiration**: Always verify `isExpired()` before using cached data
