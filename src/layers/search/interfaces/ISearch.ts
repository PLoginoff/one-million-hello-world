/**
 * Search Interface
 *
 * Defines the contract for the Full-text and vector search abstractions layer.
 */

import { SearchResult, SearchContext } from '../types/search-types';

export interface ISearch {
  execute(context: SearchContext): Promise<SearchResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
