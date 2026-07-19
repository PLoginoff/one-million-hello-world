/**
 * Random Eviction Strategy
 *
 * Evicts a random cache entry.
 */

import { IEvictionStrategy } from './IEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class RandomEvictionStrategy<T> implements IEvictionStrategy<T> {
  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null {
    if (entries.size === 0) {
      return null;
    }

    const keys = Array.from(entries.keys());
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  }

  onAccess(_key: string, _entry: CacheEntry<T>): void {
    // Random doesn't track access
  }

  onAdd(_key: string, _entry: CacheEntry<T>): void {
    // Random doesn't track insertion
  }

  onRemove(_key: string): void {
    // Random doesn't track insertion
  }

  reset(): void {
    // No state to reset
  }

  getName(): string {
    return 'RANDOM';
  }
}
