/**
 * Cached Query Strategy
 *
 * Executes queries with caching.
 */

import { IRepositoryStrategy } from './IRepositoryStrategy';
import { RepositoryEntity } from '../../domain/entities/RepositoryEntity';

export class CachedQueryStrategy implements IRepositoryStrategy {
  private cache: Map<string, unknown>;

  constructor() {
    this.cache = new Map();
  }

  getName(): string {
    return 'CACHED_QUERY';
  }

  query(repository: RepositoryEntity, query: unknown): Promise<unknown> {
    const cacheKey = this.getCacheKey(repository.data.id, query);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const result = query;
    this.cache.set(cacheKey, result);
    return Promise.resolve(result);
  }

  private getCacheKey(repositoryId: string, query: unknown): string {
    return `${repositoryId}:${JSON.stringify(query)}`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
