/**
 * Cache Validation Service
 * 
 * Domain service for validating cache operations and data.
 */

import { CacheEntry } from '../entities/CacheEntry';
import { CacheKey } from '../entities/CacheKey';
import { TTL } from '../value-objects/TTL';

export class CacheValidationService {
  /**
   * Validate cache key
   */
  static validateKey(key: string | CacheKey): void {
    if (typeof key === 'string') {
      CacheKey.create(key);
    }
  }

  /**
   * Validate TTL value
   */
  static validateTTL(ttl: number | TTL): void {
    if (typeof ttl === 'number') {
      if (ttl < 0) {
        throw new Error('TTL cannot be negative');
      }
    }
  }

  /**
   * Validate cache entry
   */
  static validateEntry<T>(entry: CacheEntry<T>): void {
    if (!entry.key) {
      throw new Error('Cache entry must have a key');
    }
    if (entry.value === undefined || entry.value === null) {
      throw new Error('Cache entry must have a value');
    }
  }

  /**
   * Validate cache size
   */
  static validateSize(size: number): void {
    if (size < 0) {
      throw new Error('Cache size cannot be negative');
    }
    if (size > 1000000) {
      throw new Error('Cache size cannot exceed 1,000,000 entries');
    }
  }

  /**
   * Validate pattern for invalidation
   */
  static validatePattern(pattern: string): void {
    try {
      new RegExp(pattern);
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${pattern}`);
    }
  }

  /**
   * Check if entry is valid for storage
   */
  static isEntryValidForStorage<T>(entry: CacheEntry<T>): boolean {
    try {
      this.validateEntry(entry);
      return !entry.isExpired();
    } catch {
      return false;
    }
  }
}
