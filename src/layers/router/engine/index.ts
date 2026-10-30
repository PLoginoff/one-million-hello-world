/**
 * Router Engine — public exports.
 *
 * Radix-trie route resolution with specificity scoring, parametric and
 * wildcard segments, per-route middleware, groups with shared prefixes,
 * LRU-cached lookups, and 405 detection.
 *
 * @module RouterLayer/Engine
 */

export * from './types';

export {
  RadixTrieRouter,
  RouteConflictError,
  tokenizePattern,
  composePipeline,
} from './RadixTrieRouter';

export { RouteCache } from './RouteCache';

export { RouterEngine } from './RouterEngine';
export type { RouterEngineOptions } from './RouterEngine';
