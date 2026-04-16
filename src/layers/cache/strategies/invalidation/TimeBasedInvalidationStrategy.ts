/**
 * Time-Based Invalidation Strategy
 * 
 * Invalidates entries based on TTL expiration.
 */

import { IInvalidationStrategy } from './IInvalidationStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class TimeBasedInvalidationStrategy<T> implements IInvalidationStrategy<T> {
  shouldInvalidate(entry: CacheEntry<T>, currentTime: number): boolean {
    return entry.isExpired(currentTime);
  }

  getName(): string {
    return 'TIME_BASED';
  }
}
