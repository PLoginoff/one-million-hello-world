/**
 * Manual Invalidation Strategy
 * 
 * Only invalidates when explicitly requested.
 */

import { IInvalidationStrategy } from './IInvalidationStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class ManualInvalidationStrategy<T> implements IInvalidationStrategy<T> {
  shouldInvalidate(entry: CacheEntry<T>, currentTime: number): boolean {
    // Manual invalidation never auto-invalidates
    return false;
  }

  getName(): string {
    return 'MANUAL';
  }
}
