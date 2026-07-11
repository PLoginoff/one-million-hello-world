/**
 * EdgeCache Interface
 *
 * Defines the contract for the Edge caching and CDN abstraction layer.
 */

import { EdgeCacheResult, EdgeCacheContext } from '../types/edge-cache-types';

export interface IEdgeCache {
  /**
   * Execute the edgeCache operation
   */
  execute(context: EdgeCacheContext): Promise<EdgeCacheResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
