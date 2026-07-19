/**
 * Direct Query Strategy
 *
 * Executes queries directly without caching.
 */

import { IRepositoryStrategy } from './IRepositoryStrategy';
import { RepositoryEntity } from '../../domain/entities/RepositoryEntity';

export class DirectQueryStrategy implements IRepositoryStrategy {
  getName(): string {
    return 'DIRECT_QUERY';
  }

  query(repository: RepositoryEntity, query: unknown): Promise<unknown> {
    return Promise.resolve(query);
  }
}
