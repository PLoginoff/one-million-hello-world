/**
 * Route Planner — compile-time route-table assembly with conflict
 * detection and middleware inheritance.
 *
 * A declarative builder that produces an immutable `RouteTable` the
 * {@link HotSwapRouter} can publish atomically. Planning is where the
 * expensive work belongs — registration is O(1) per route in the trie,
 * but validation (duplicate detection, constraint compilation, host
 * pattern compilation, middleware merge) is done ONCE here so a
 * hot-swap can publish a fully-checked table in a single assignment.
 *
 * Validation pass (fails fast, collects every error):
 *   - duplicate (method, path, host) triples
 *   - malformed path patterns (tokenizer errors)
 *   - invalid constraint regexes / host patterns
 *   - middleware references that aren't registered in the plan
 *
 * Group-style composition: `prefix('/api').group(...)` merges the
 * prefix into each route path and layers group middleware before
 * route-local middleware — the same semantics as RouterEngine.group
 * but resolved at *build* time rather than at dispatch.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { ConstrainedRoute, compileHostPattern, parseConstrainedPattern } from './RouteConstraints';
import { RouteMiddleware } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named middleware registered in the plan for reference by routes. */
export interface NamedMiddleware {
  readonly name: string;
  readonly middleware: RouteMiddleware;
}

/** A route in the plan — middleware may be inline or referenced by name. */
export interface PlannedRoute extends Omit<ConstrainedRoute, 'middleware'> {
  readonly middleware?: readonly (RouteMiddleware | string)[];
  /** Route tags for introspection (docs, metrics labels). */
  readonly tags?: readonly string[];
}

/** Planning output — immutable route set + diagnostics. */
export interface RouteTable {
  readonly routes: readonly ConstrainedRoute[];
  readonly diagnostics: readonly RoutePlanDiagnostic[];
}

/** One planning finding. */
export interface RoutePlanDiagnostic {
  readonly kind: 'duplicate' | 'invalid_path' | 'invalid_constraint' | 'invalid_host' | 'unknown_middleware';
  readonly message: string;
  readonly route?: Partial<PlannedRoute>;
}

/** Options for {@link RoutePlanner}. */
export interface RoutePlannerOptions {
  /** Throw on the first diagnostic instead of collecting. */
  readonly strict?: boolean;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Fluent route-table builder.
 *
 *   const table = new RoutePlanner()
 *     .middleware('auth', authMw)
 *     .prefix('/api/v1')
 *     .route({ method: GET, path: '/users/:id<int>', middleware: ['auth'], ... })
 *     .build();
 *
 * The built table feeds `ConstrainedRouterEngine.addRoute` or a
 * HotSwapRouter stage wholesale.
 */
export class RoutePlanner {
  private readonly _strict: boolean;
  private readonly _named: Map<string, RouteMiddleware>;
  private readonly _routes: PlannedRoute[];
  private _prefix: string;
  private _groupMiddleware: (RouteMiddleware | string)[];

  constructor(options?: RoutePlannerOptions) {
    this._strict = options?.strict ?? false;
    this._named = new Map();
    this._routes = [];
    this._prefix = '';
    this._groupMiddleware = [];
  }

  /** Register a named middleware for reference inside routes. */
  middleware(name: string, mw: RouteMiddleware): this {
    if (this._named.has(name)) {
      throw new Error(`RoutePlanner: middleware '${name}' already registered`);
    }
    this._named.set(name, mw);
    return this;
  }

  /** Set the path prefix prepended to every subsequent route. */
  prefix(prefix: string): this {
    this._prefix = prefix.endsWith('/') && prefix !== '/' ? prefix.slice(0, -1) : prefix;
    return this;
  }

  /** Set group middleware applied before each subsequent route's own. */
  groupMiddleware(...mw: (RouteMiddleware | string)[]): this {
    this._groupMiddleware = mw;
    return this;
  }

  /** Clear the prefix + group middleware (start a new section). */
  section(): this {
    this._prefix = '';
    this._groupMiddleware = [];
    return this;
  }

  /** Queue a route for the table. */
  route(route: PlannedRoute): this {
    this._routes.push(route);
    return this;
  }

  /** Queue several routes. */
  routes(routes: readonly PlannedRoute[]): this {
    for (const r of routes) {
      this._routes.push(r);
    }
    return this;
  }

  /**
   * Validate + materialize the table. In strict mode the first
   * diagnostic throws; otherwise every problem lands in
   * `table.diagnostics` and the offending routes are dropped.
   */
  build(): RouteTable {
    const diagnostics: RoutePlanDiagnostic[] = [];
    const seen = new Map<string, PlannedRoute>();
    const out: ConstrainedRoute[] = [];

    for (const route of this._routes) {
      const full = this.materialize(route, diagnostics);
      if (full === null) {
        if (this._strict && diagnostics.length > 0) {
          throw new RoutePlanError(diagnostics);
        }
        continue;
      }
      const key = `${full.method} ${full.path} @${full.host ?? ''}`;
      if (seen.has(key)) {
        diagnostics.push({
          kind: 'duplicate',
          message: `Duplicate route: ${key}`,
          route,
        });
        if (this._strict) {
          throw new RoutePlanError(diagnostics);
        }
        continue;
      }
      seen.set(key, full);
      out.push(full);
    }

    if (this._strict && diagnostics.length > 0) {
      throw new RoutePlanError(diagnostics);
    }
    return { routes: out, diagnostics };
  }

  /** Current planned count (pre-validation). */
  get pendingCount(): number {
    return this._routes.length;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private materialize(route: PlannedRoute, diagnostics: RoutePlanDiagnostic[]): ConstrainedRoute | null {
    let ok = true;

    // 1. Path syntax — the constraint parser validates `<...>` shapes.
    // The built route keeps the ORIGINAL constraint syntax: engines
    // that consume the table re-parse constraints themselves, so
    // stripping here would silently drop them.
    const joined =
      this._prefix === ''
        ? route.path
        : `${this._prefix}${route.path.startsWith('/') ? '' : '/'}${route.path}`;
    let path = joined;
    try {
      parseConstrainedPattern(joined);
    } catch (err) {
      diagnostics.push({ kind: 'invalid_path', message: (err as Error).message, route });
      ok = false;
    }

    // 2. Host pattern compiles.
    try {
      if (route.host !== undefined) {
        compileHostPattern(route.host);
      }
    } catch (err) {
      diagnostics.push({ kind: 'invalid_host', message: (err as Error).message, route });
      ok = false;
    }

    // 3. Named middleware resolves.
    const resolved: RouteMiddleware[] = [];
    for (const mw of [...this._groupMiddleware, ...(route.middleware ?? [])]) {
      if (typeof mw === 'function') {
        resolved.push(mw);
        continue;
      }
      const found = this._named.get(mw);
      if (found === undefined) {
        diagnostics.push({ kind: 'unknown_middleware', message: `Unknown middleware '${mw}'`, route });
        ok = false;
        continue;
      }
      resolved.push(found);
    }

    if (!ok) {
      return null;
    }
    return { ...route, path, middleware: resolved };
  }
}

/** Raised in strict mode — carries every diagnostic collected so far. */
export class RoutePlanError extends Error {
  readonly diagnostics: readonly RoutePlanDiagnostic[];
  constructor(diagnostics: readonly RoutePlanDiagnostic[]) {
    super(`Route plan failed: ${diagnostics.map((d) => d.message).join('; ')}`);
    this.name = 'RoutePlanError';
    this.diagnostics = diagnostics;
  }
}
