/**
 * Router Engine — Shared Types
 *
 * Type definitions for the radix-trie routing engine:
 * - Compressed route path segments (static text / `:param` / `*`)
 * - Match results with specificity scoring
 * - Per-route middleware attachment
 * - Route groups with shared prefixes
 * - 405 detection with allowed-methods listing
 *
 * The existing `Router` in `implementations/` keeps flat route records
 * with linear matching; this engine trades registration-time work for
 * O(path-segments) lookup — the standard trade-off in production
 * routers (httprouter, radix trees in Express alternatives).
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';

/**
 * Route registration payload for the radix engine. Unlike
 * {@link Route} — which is storage-shaped — this is execution-shaped:
 * middleware are typed functions, not string names.
 */
export interface EngineRoute {
  /** HTTP method. */
  readonly method: HttpMethod;
  /** Path pattern: `/users/:id`, `/files/*path`, `/health`. */
  readonly path: string;
  /** Invoked on a successful match. */
  readonly handler: RouteHandler;
  /** Ordered route-local middleware (wraps the handler). */
  readonly middleware?: readonly RouteMiddleware[];
  /** Human-readable label for diagnostics/405 output. */
  readonly name?: string;
  /** Free-form metadata (tags, version, docs). */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Typed middleware attached to a route. Same onion signature as the
 * middleware layer: call `next()` to continue, or return a response to
 * short-circuit.
 */
export type RouteMiddleware = (
  request: RouteRequest,
  next: () => Promise<RouteResult>
) => Promise<RouteResult>;

/** Terminal route handler. */
export type RouteHandler = (request: RouteRequest) => Promise<RouteResult>;

/**
 * Request record presented to matched routes — carries extracted
 * params, the raw path, and a per-request state bag.
 */
export interface RouteRequest {
  readonly method: HttpMethod;
  readonly path: string;
  /** Parameters captured by `:param` segments. */
  readonly params: Record<string, string>;
  /** Wildcard tail captured by `*` (may span segments). */
  readonly wildcard?: string;
  /** Registered pattern that matched (e.g. `/users/:id`). */
  readonly matchedPattern?: string;
  /** Request headers (lower-case names). */
  readonly headers: Record<string, string>;
  /** Free-form per-request bag shared across middleware+handler. */
  readonly state: Record<string, unknown>;
}

/**
 * Terminal result produced by a handler — status + optional body.
 * Transport-free so the engine is testable without a real HTTP layer.
 */
export interface RouteResult {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Successful match output with the specificity score that selected it.
 */
export interface EngineMatch {
  readonly route: EngineRoute;
  /** Specificity score — higher = more static text matched. */
  readonly specificity: number;
  readonly request: RouteRequest;
}

/**
 * Match outcome covering hit / miss / method-mismatch.
 */
export type MatchResult =
  | { readonly kind: 'matched'; readonly match: EngineMatch }
  | { readonly kind: 'not_found' }
  | {
      readonly kind: 'method_not_allowed';
      /** Path matched, but the request method was not registered. */
      readonly allowedMethods: readonly HttpMethod[];
      /** Highest-specificity route *any* method matched (for context). */
      readonly closestPattern: string;
    };

/**
 * Route group — shared path prefix and shared middleware.
 */
export interface RouteGroupDefinition {
  /** Prefix prepended to each contained route path (`/api/v1`). */
  readonly prefix: string;
  /** Middleware applied to every route in the group, before route-local. */
  readonly middleware?: readonly RouteMiddleware[];
  /** Routes registered under this prefix. */
  readonly routes: readonly EngineRoute[];
}

/** LRU cache sizing knob for resolved-route lookups. */
export interface RouteCacheConfig {
  /** Maximum number of `(method, path)` resolutions retained. */
  readonly capacity: number;
}

/**
 * Cache statistics snapshot.
 */
export interface RouteCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly capacity: number;
  readonly evictions: number;
}
