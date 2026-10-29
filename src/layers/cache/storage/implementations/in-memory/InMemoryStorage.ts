/**
 * In-Memory Storage Implementation
 *
 * Simple in-memory storage using Map.
 */

import { IStorage } from '../../interfaces/IStorage';
import { CacheEntry } from '../../../domain/entities/CacheEntry';

export class InMemoryStorage<T> implements IStorage<T> {
  private storage: Map<string, CacheEntry<T>>;

  constructor() {
    this.storage = new Map();
  }

  get(key: string): CacheEntry<T> | null {
    const entry = this.storage.get(key);
    if (!entry || entry.isExpired()) {
      return null;
    }
    return entry;
  }

  set(key: string, entry: CacheEntry<T>): void {
    this.storage.set(key, entry);
  }

  delete(key: string): boolean {
    return this.storage.delete(key);
  }

  has(key: string): boolean {
    const entry = this.storage.get(key);
    return entry !== undefined && !entry.isExpired();
  }

  keys(): string[] {
    return Array.from(this.storage.keys());
  }

  entries(): CacheEntry<T>[] {
    return Array.from(this.storage.values());
  }

  values(): CacheEntry<T>[] {
    return this.entries();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.storage.entries()) {
      if (entry.isExpired(now)) {
        this.storage.delete(key);
      }
    }
  }

  size(): number {
    return this.storage.size;
  }

  clear(): void {
    this.storage.clear();
  }

  getType(): string {
    return 'IN_MEMORY';
  }

  /**
   * Get underlying Map for direct access (use with caution)
   */
  getRawStorage(): Map<string, CacheEntry<T>> {
    return this.storage;
  }
}
