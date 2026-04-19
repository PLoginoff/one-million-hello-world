/**
 * Cached Query Strategy
 * 
 * Executes queries with caching.
 */

import { IRepositoryStrategy } from './IRepositoryStrategy';
import { RepositoryEntity } from '../../domain/entities/RepositoryEntity';

export class CachedQueryStrategy implements IRepositoryStrategy {
  private cache: Map<string, any>;

  constructor() {
    this.cache = new Map();
  }

  getName(): string {
    return 'CACHED_QUERY';
  }

  async query(repository: RepositoryEntity, query: any): Promise<any> {
    const cacheKey = this.getCacheKey(repository.data.id, query);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const result = query;
    this.cache.set(cacheKey, result);
    return result;
  }

  private getCacheKey(repositoryId: string, query: any): string {
    return `${repositoryId}:${JSON.stringify(query)}`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
