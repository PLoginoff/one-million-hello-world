/**
 * FIFO (First In First Out) Eviction Strategy
 * 
 * Evicts the oldest cache entry based on insertion order.
 */

import { IEvictionStrategy } from './IEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class FIFOEvictionStrategy<T> implements IEvictionStrategy<T> {
  private insertionOrder: string[];

  constructor() {
    this.insertionOrder = [];
  }

  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null {
    if (this.insertionOrder.length === 0) {
      return null;
    }

    // Find first inserted key that still exists
    for (const key of this.insertionOrder) {
      if (entries.has(key)) {
        return key;
      }
    }

    // Fallback to entry's createdAt
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of entries.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    // FIFO doesn't track access
  }

  onAdd(key: string, entry: CacheEntry<T>): void {
    this.insertionOrder.push(key);
  }

  reset(): void {
    this.insertionOrder = [];
  }

  getName(): string {
    return 'FIFO';
  }
}
