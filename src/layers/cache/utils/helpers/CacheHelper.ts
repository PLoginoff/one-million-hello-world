/**
 * Cache Helper Utilities
 *
 * Utility functions for cache operations.
 */

import { CacheEntry } from '../../domain/entities/CacheEntry';

export class CacheHelper {
  /**
   * Calculate approximate size of a cache entry in bytes
   */
  static calculateSize<T>(entry: CacheEntry<T>): number {
    const keySize = entry.key.length * 2;
    const valueSize = JSON.stringify(entry.value).length * 2;
    return keySize + valueSize + 64;
  }

  /**
   * Generate a cache key from multiple parts
   */
  static generateKey(...parts: string[]): string {
    return parts.filter((part) => part.length > 0).join(':');
  }

  /**
   * Parse a cache key into its parts
   */
  static parseKey(key: string): string[] {
    if (key == null || key === '') return [];
    return key.split(':');
  }

  /**
   * Serialize a cache entry to JSON
   */
  static serialize<T>(entry: CacheEntry<T>): string {
    return JSON.stringify({
      key: entry.key,
      value: entry.value,
      ttl: entry.ttl,
      createdAt: entry.createdAt,
      accessCount: entry.accessCount,
      lastAccessedAt: entry.lastAccessedAt,
    });
  }

  /**
   * Deserialize a cache entry from JSON
   */
  static deserialize<T>(data: string): CacheEntry<T> {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid cache entry data');
    }
    const raw = parsed as Record<string, unknown>;
    const key = String(raw.key ?? '');
    const value = raw.value as T;
    const ttl = Number(raw.ttl ?? 0);
    const createdAt = Number(raw.createdAt ?? 0);
    const entry = new CacheEntry<T>(key, value, ttl, createdAt);
    entry.accessCount = Number(raw.accessCount ?? 0);
    entry.lastAccessedAt = Number(raw.lastAccessedAt ?? createdAt);
    return entry;
  }

  /**
   * Generate a hash for a key
   */
  static hashKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Check if entry is expired
   */
  static isExpired<T>(entry: CacheEntry<T>, currentTime: number = Date.now()): boolean {
    return entry.isExpired(currentTime);
  }

  /**
   * Format bytes to human readable
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Format milliseconds to human readable
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Deep clone an object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (Array.isArray(obj)) {
      return obj.map((item: unknown) => CacheHelper.deepClone(item)) as unknown as T;
    }
    const clonedObj: Record<string, unknown> = {};
    const record = obj as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      clonedObj[key] = CacheHelper.deepClone(record[key]);
    }
    return clonedObj as unknown as T;
  }

  /**
   * Sanitize cache key
   */
  static sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_\-:.]/g, '_');
  }

  /**
   * Validate regex pattern
   */
  static isValidPattern(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }
}
