/**
 * LFU (Least Frequently Used) Eviction Strategy
 * 
 * Evicts the least frequently used cache entry.
 */

import { IEvictionStrategy } from './IEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class LFUEvictionStrategy<T> implements IEvictionStrategy<T> {
  private frequencyMap: Map<string, number>;

  constructor() {
    this.frequencyMap = new Map();
  }

  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null {
    if (entries.size === 0) {
      return null;
    }

    let leastAccessedKey: string | null = null;
    let leastAccessCount = Infinity;

    for (const [key, entry] of entries.entries()) {
      const freq = this.frequencyMap.get(key) || entry.accessCount;
      if (freq < leastAccessCount) {
        leastAccessCount = freq;
        leastAccessedKey = key;
      }
    }

    return leastAccessedKey;
  }

  onAccess(key: string, entry: CacheEntry<T>): void {
    const currentFreq = this.frequencyMap.get(key) || 0;
    this.frequencyMap.set(key, currentFreq + 1);
  }

  onAdd(key: string, entry: CacheEntry<T>): void {
    this.frequencyMap.set(key, 0);
  }

  reset(): void {
    this.frequencyMap.clear();
  }

  getName(): string {
    return 'LFU';
  }
}
