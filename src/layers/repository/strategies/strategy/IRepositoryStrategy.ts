/**
 * Repository Strategy Interface
 *
 * Defines contract for different repository strategies.
 */

import { RepositoryEntity } from '../../domain/entities/RepositoryEntity';

export interface IRepositoryStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Execute query
   */
  query(repository: RepositoryEntity, query: unknown): Promise<unknown>;
}
