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

  async query(repository: RepositoryEntity, query: any): Promise<any> {
    return query;
  }
}
