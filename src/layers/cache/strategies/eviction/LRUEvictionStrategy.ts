/**
 * LRU (Least Recently Used) Eviction Strategy
 * 
 * Evicts the least recently used cache entry.
 */

import { IEvictionStrategy } from './IEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class LRUEvictionStrategy<T> implements IEvictionStrategy<T> {
  private accessOrder: Map<string, number>;
  private accessCounter: number;

  constructor() {
    this.accessOrder = new Map();
    this.accessCounter = 0;
  }

  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null {
    if (entries.size === 0) {
      return null;
    }

    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (entries.has(key) && accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    // Fallback to entry's lastAccessedAt if tracking failed
    if (!oldestKey) {
      let oldestTime = Infinity;
      for (const [key, entry] of entries.entries()) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      }
    }

    return oldestKey;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    this.accessOrder.set(key, this.accessCounter++);
  }

  onAdd(key: string, entry: CacheEntry<T>): void {
    this.accessOrder.set(key, this.accessCounter++);
  }

  reset(): void {
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  getName(): string {
    return 'LRU';
  }
}
