# Strategies Layer Documentation

## Overview

The Strategies Layer provides pluggable eviction and invalidation strategies for the Cache Layer. This design allows for flexible cache behavior customization without modifying core cache logic.

## Structure

```
strategies/
├── eviction/           # Eviction strategies
│   ├── IEvictionStrategy.ts
│   ├── LRUEvictionStrategy.ts
│   ├── LFUEvictionStrategy.ts
│   ├── FIFOEvictionStrategy.ts
│   ├── RandomEvictionStrategy.ts
│   └── index.ts
├── invalidation/      # Invalidation strategies
│   ├── IInvalidationStrategy.ts
│   ├── TimeBasedInvalidationStrategy.ts
│   ├── ManualInvalidationStrategy.ts
│   ├── SizeBasedInvalidationStrategy.ts
│   └── index.ts
└── index.ts
```

## Eviction Strategies

### IEvictionStrategy Interface

Base interface for all eviction strategies.

```typescript
export interface IEvictionStrategy<T> {
  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null;
  onAccess(key: string, entry: CacheEntry<T>): void;
  onAdd(key: string, entry: CacheEntry<T>): void;
  reset(): void;
  getName(): string;
}
```

### LRU (Least Recently Used)

Evicts the least recently used cache entry. Best for temporal locality patterns.

```typescript
import { LRUEvictionStrategy } from '../strategies/eviction/LRUEvictionStrategy';

const strategy = new LRUEvictionStrategy<string>();
// Tracks access order and evicts least recently accessed
```

**Characteristics:**
- Good for temporal locality
- Requires O(1) access tracking
- Predictable behavior
- Memory overhead for tracking

**Use Cases:**
- Web page caching
- API response caching
- Database query result caching

### LFU (Least Frequently Used)

Evicts the least frequently used cache entry. Best for frequency-based access patterns.

```typescript
import { LFUEvictionStrategy } from '../strategies/eviction/LFUEvictionStrategy';

const strategy = new LFUEvictionStrategy<string>();
// Tracks access frequency and evicts least frequently accessed
```

**Characteristics:**
- Good for frequency-based patterns
- Can suffer from "cache pollution"
- Requires O(1) frequency tracking
- Memory overhead for frequency counters

**Use Cases:**
- Popular content caching
- Static asset caching
- Frequently accessed configuration data

### FIFO (First In First Out)

Evicts the oldest cache entry based on insertion order. Simple and predictable.

```typescript
import { FIFOEvictionStrategy } from '../strategies/eviction/FIFOEvictionStrategy';

const strategy = new FIFOEvictionStrategy<string>();
// Evicts in insertion order
```

**Characteristics:**
- Simple implementation
- No access tracking overhead
- Predictable eviction order
- Doesn't consider access patterns

**Use Cases:**
- Log buffers
- Message queues
- Simple caching scenarios

### Random

Evicts a random cache entry. Provides uniform distribution but unpredictable behavior.

```typescript
import { RandomEvictionStrategy } from '../strategies/eviction/RandomEvictionStrategy';

const strategy = new RandomEvictionStrategy<string>();
// Evicts random entry
```

**Characteristics:**
- No tracking overhead
- Uniform distribution
- Unpredictable behavior
- Simple implementation

**Use Cases:**
- Testing and benchmarking
- When access patterns are unknown
- Simple scenarios with uniform access

## Invalidation Strategies

### IInvalidationStrategy Interface

Base interface for all invalidation strategies.

```typescript
export interface IInvalidationStrategy<T> {
  shouldInvalidate(entry: CacheEntry<T>, currentTime: number): boolean;
  getName(): string;
}
```

### Time-Based

Invalidates entries based on TTL expiration.

```typescript
import { TimeBasedInvalidationStrategy } from '../strategies/invalidation/TimeBasedInvalidationStrategy';

const strategy = new TimeBasedInvalidationStrategy<string>();
// Invalidates when entry.ttl expires
```

**Characteristics:**
- Simple and predictable
- Based on entry TTL
- No additional tracking
- Works with any eviction strategy

**Use Cases:**
- Time-sensitive data
- Session data
- Cached API responses with expiration

### Manual

Only invalidates when explicitly requested. No automatic invalidation.

```typescript
import { ManualInvalidationStrategy } from '../strategies/invalidation/ManualInvalidationStrategy';

const strategy = new ManualInvalidationStrategy<string>();
// Never auto-invalidates
```

**Characteristics:**
- No automatic invalidation
- Manual control only
- Requires explicit invalidation calls
- Useful for long-lived data

**Use Cases:**
- Configuration data
- Static content
- Data with manual refresh triggers

### Size-Based

Invalidates entries when cache size exceeds limit. Works with eviction strategies.

```typescript
import { SizeBasedInvalidationStrategy } from '../strategies/invalidation/SizeBasedInvalidationStrategy';

const strategy = new SizeBasedInvalidationStrategy<string>(1000);
// Triggers eviction when size limit reached
```

**Characteristics:**
- Monitors cache size
- Triggers eviction when needed
- Works with eviction strategies
- Configurable size limits

**Use Cases:**
- Memory-constrained environments
- Preventing cache bloat
- Size-aware caching

## Strategy Selection Guide

| Strategy | Temporal Locality | Frequency | Memory Overhead | Predictability |
|----------|------------------|-----------|-----------------|----------------|
| LRU      | Excellent        | Poor      | Medium          | High           |
| LFU      | Poor             | Excellent | Medium          | Medium         |
| FIFO     | None             | None      | Low             | High           |
| Random   | None             | None      | None            | Low            |

## Using Strategies with Factories

```typescript
import { EvictionStrategyFactory } from '../factories/strategies/EvictionStrategyFactory';

// Create by type
const lruStrategy = EvictionStrategyFactory.create<string>(InvalidationStrategy.LRU);
const lfuStrategy = EvictionStrategyFactory.create<string>(InvalidationStrategy.LFU);

// Create directly
const lru = EvictionStrategyFactory.createLRU<string>();
const lfu = EvictionStrategyFactory.createLFU<string>();
const fifo = EvictionStrategyFactory.createFIFO<string>();
const random = EvictionStrategyFactory.createRandom<string>();
```

## Custom Strategy Implementation

Create custom eviction strategy:

```typescript
import { IEvictionStrategy } from '../strategies/eviction/IEvictionStrategy';
import { CacheEntry } from '../domain/entities/CacheEntry';

export class CustomEvictionStrategy<T> implements IEvictionStrategy<T> {
  private customData: Map<string, number>;

  constructor() {
    this.customData = new Map();
  }

  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null {
    // Custom eviction logic
    let selectedKey: string | null = null;
    let lowestScore = Infinity;

    for (const [key, entry] of entries.entries()) {
      const score = this.calculateScore(key, entry);
      if (score < lowestScore) {
        lowestScore = score;
        selectedKey = key;
      }
    }

    return selectedKey;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    // Track access
    this.customData.set(key, (this.customData.get(key) || 0) + 1);
  }

  onAdd(key: string, entry: CacheEntry<T>): void {
    // Initialize tracking
    this.customData.set(key, 0);
  }

  reset(): void {
    this.customData.clear();
  }

  getName(): string {
    return 'CUSTOM';
  }

  private calculateScore(key: string, entry: CacheEntry<T>): number {
    // Custom scoring logic
    const frequency = this.customData.get(key) || 0;
    const recency = Date.now() - entry.lastAccessedAt;
    return frequency / (recency + 1);
  }
}
```

## Strategy Combinations

### LRU + Time-Based

```typescript
const evictionStrategy = new LRUEvictionStrategy<string>();
const invalidationStrategy = new TimeBasedInvalidationStrategy<string>();
```

Best for: Web caching with time-based expiration

### LFU + Manual

```typescript
const evictionStrategy = new LFUEvictionStrategy<string>();
const invalidationStrategy = new ManualInvalidationStrategy<string>();
```

Best for: Popular content with manual refresh

### FIFO + Size-Based

```typescript
const evictionStrategy = new FIFOEvictionStrategy<string>();
const invalidationStrategy = new SizeBasedInvalidationStrategy<string>(1000);
```

Best for: Simple buffering with size limits

## Performance Considerations

### Time Complexity

| Strategy | selectEntryToEvict | onAccess | onAdd |
|----------|-------------------|----------|-------|
| LRU      | O(n)              | O(1)     | O(1)  |
| LFU      | O(n)              | O(1)     | O(1)  |
| FIFO     | O(n)              | O(0)     | O(1)  |
| Random   | O(n)              | O(0)     | O(0)  |

### Space Complexity

| Strategy | Space |
|----------|-------|
| LRU      | O(n)  |
| LFU      | O(n)  |
| FIFO     | O(n)  |
| Random   | O(0)  |

## Testing Strategies

```typescript
describe('LRUEvictionStrategy', () => {
  it('should evict least recently used', () => {
    const strategy = new LRUEvictionStrategy<string>();
    const entries = new Map();

    // Add entries
    entries.set('key1', entry1);
    strategy.onAdd('key1', entry1);

    // Access key1
    strategy.onAccess('key1', entry1);

    // Add key2
    entries.set('key2', entry2);
    strategy.onAdd('key2', entry2);

    // Key2 should be evicted (least recently accessed)
    const evicted = strategy.selectEntryToEvict(entries);
    expect(evicted).toBe('key2');
  });
});
```

## Best Practices

1. **Match strategy to access pattern**: Choose based on how data is accessed
2. **Consider memory overhead**: Some strategies require more tracking
3. **Test with real data**: Validate strategy choice with production-like data
4. **Monitor hit rates**: Track performance to validate strategy choice
5. **Be prepared to switch**: Strategy needs may change over time
