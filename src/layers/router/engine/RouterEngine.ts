/**
 * Router Engine
 *
 * Facade composing the radix trie, the LRU resolution cache, and route
 * groups into one registration/dispatch surface.
 *
 * - Registration supports groups: `group({ prefix: '/api/v1', routes })`
 *   merges shared middleware before route-local middleware.
 * - Every `match`/`dispatch` goes through the cache first; mutations
 *   (`addRoute`, `removeRoute`, `group`) invalidate it.
 * - Dispatch returns 404 / 405-shaped results, keeping transport code
 *   thin.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { RadixTrieRouter } from './RadixTrieRouter';
import { RouteCache } from './RouteCache';
import {
  EngineRoute,
  MatchResult,
  RouteCacheStats,
  RouteGroupDefinition,
  RouteMiddleware,
  RouteResult,
} from './types';

/** Engine options. */
export interface RouterEngineOptions {
  /** LRU capacity for resolved routes (default 512). */
  readonly cacheCapacity?: number;
  /** Disable the resolution cache. */
  readonly disableCache?: boolean;
}

/** Registered group record (for introspection/removal). */
interface RegisteredGroup {
  readonly name: string;
  readonly prefix: string;
  readonly routes: readonly EngineRoute[];
}

export class RouterEngine {
  private readonly _trie: RadixTrieRouter;
  private readonly _cache: RouteCache | null;
  private readonly _groups: Map<string, RegisteredGroup>;
  private _groupSeq: number;

  constructor(options?: RouterEngineOptions) {
    this._trie = new RadixTrieRouter();
    this._cache = options?.disableCache === true ? null : new RouteCache({ capacity: options?.cacheCapacity });
    this._groups = new Map();
    this._groupSeq = 0;
  }

  /** Register a single route. */
  addRoute(route: EngineRoute): void {
    this._trie.addRoute(route);
    this._cache?.invalidate();
  }

  /** Remove a route by method + pattern. */
  removeRoute(method: HttpMethod, pattern: string): boolean {
    const removed = this._trie.removeRoute(method, pattern);
    if (removed) {
      this._cache?.invalidate();
    }
    return removed;
  }

  /**
   * Register a group of routes under a shared prefix, with group-wide
   * middleware prepended to each route's own middleware.
   *
   * @returns The generated group name (or the provided name).
   */
  group(definition: RouteGroupDefinition & { name?: string }): string {
    const name = definition.name ?? `group-${++this._groupSeq}`;
    if (this._groups.has(name)) {
      throw new Error(`Route group already registered: ${name}`);
    }
    const prefix = normalizePrefix(definition.prefix);
    const groupMiddleware = definition.middleware ?? [];

    for (const route of definition.routes) {
      const path = joinPaths(prefix, route.path);
      const merged: EngineRoute = {
        ...route,
        path,
        middleware: mergeMiddleware(groupMiddleware, route.middleware ?? []),
      };
      this._trie.addRoute(merged);
    }

    this._groups.set(name, { name, prefix, routes: definition.routes });
    this._cache?.invalidate();
    return name;
  }

  /**
   * Remove all routes registered via `group(name)`.
   */
  removeGroup(name: string): boolean {
    const group = this._groups.get(name);
    if (group === undefined) {
      return false;
    }
    for (const route of group.routes) {
      const path = joinPaths(normalizePrefix(group.prefix), route.path);
      this._trie.removeRoute(route.method, path);
    }
    this._groups.delete(name);
    this._cache?.invalidate();
    return true;
  }

  /** Registered group names. */
  groups(): string[] {
    return [...this._groups.keys()];
  }

  /**
   * Resolve `method + path` — cache-backed. See {@link RadixTrieRouter.match}.
   */
  match(method: HttpMethod, path: string): MatchResult {
    if (this._cache !== null) {
      const cached = this._cache.lookup(method, path);
      if (cached !== undefined) {
        return cached;
      }
      const result = this._trie.match(method, path);
      this._cache.store(method, path, result);
      return result;
    }
    return this._trie.match(method, path);
  }

  /**
   * Dispatch through the matched route pipeline.
   * 404 / 405 produce structured results — no exceptions.
   */
  async dispatch(
    method: HttpMethod,
    path: string,
    headers?: Record<string, string>,
    state?: Record<string, unknown>
  ): Promise<RouteResult & { matchedPattern?: string }> {
    return this._trie.dispatch(method, path, headers, state);
  }

  /** Methods allowed for `path` at the best-matching node (405 helper). */
  allowedMethods(path: string): readonly HttpMethod[] {
    return this._trie.allowedMethods(path);
  }

  /** Total registered routes. */
  get routeCount(): number {
    return this._trie.routeCount;
  }

  /** Trie node count (compression diagnostic). */
  nodeCount(): number {
    return this._trie.nodeCount();
  }

  /** Max trie depth. */
  maxDepth(): number {
    return this._trie.maxDepth();
  }

  /** Cache statistics, or a zeroed snapshot when caching is off. */
  cacheStats(): RouteCacheStats {
    if (this._cache === null) {
      return { hits: 0, misses: 0, size: 0, capacity: 0, evictions: 0 };
    }
    return this._cache.stats();
  }

  /** Cache hit ratio in [0, 1]. */
  cacheHitRate(): number {
    return this._cache?.hitRate() ?? 0;
  }
}

/** Strip a trailing '/' so '/api/' + '/users' doesn't double-slash. */
function normalizePrefix(prefix: string): string {
  if (prefix === '/' || prefix === '') {
    return '';
  }
  const trimmed = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/** Join a normalized prefix to a route path. */
function joinPaths(prefix: string, path: string): string {
  if (prefix === '') {
    return path;
  }
  return `${prefix}${path.startsWith('/') ? path : `/${path}`}`;
}

function mergeMiddleware(
  group: readonly RouteMiddleware[],
  route: readonly RouteMiddleware[]
): readonly RouteMiddleware[] {
  if (group.length === 0) {
    return route;
  }
  return [...group, ...route];
}
