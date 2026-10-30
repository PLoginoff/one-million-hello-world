/**
 * Route Matcher
 *
 * Matches inbound requests to registered routes using a path-segment
 * trie (radix-style, per-segment) rather than scanning a regex list.
 *
 * Complexity:
 *  - Registration: O(L) where L = number of path segments.
 *  - Lookup:       O(L) segment comparisons plus O(M) version checks,
 *                  where M = candidate routes on the matched node.
 *
 * Supported pattern syntax:
 *  - `/api/users`          — literal segments only
 *  - `/api/users/:id`      — named parameter (matches one segment)
 *  - `/api/users/{id}`     — same, brace syntax
 *  - `/api/files/*`        — wildcard, matches zero or more segments
 *
 * When several routes match, the winner is chosen by:
 *  1. More literal segments matched (more specific pattern)
 *  2. Higher explicit `priority`
 *  3. Registration order (stable)
 *
 * @module ApiGatewayLayer/Engine
 */

import {
  GatewayRoute,
  RouteMatch,
  RouteVersionConstraint,
  GatewayUpstream,
  CanaryRules,
  RandomSource,
  DefaultRandomSource,
} from './types';

/** One node in the path trie. */
interface TrieNode {
  /** Literal-segment children. */
  literal: Map<string, TrieNode>;
  /** Parameter child (matches exactly one segment). */
  param?: { name: string; node: TrieNode };
  /** Wildcard child (matches zero+ remaining segments). */
  wildcard?: TrieNode;
  /** Routes whose pattern ends exactly here. */
  routes: RouteRegistration[];
}

interface RouteRegistration {
  route: GatewayRoute;
  /** Number of literal segments in the pattern (specificity). */
  literalCount: number;
  /** Registration sequence for stable tie-breaking. */
  seq: number;
}

/** Allocate an empty trie node. */
function createTrieNode(): TrieNode {
  return { literal: new Map(), routes: [] };
}

/** Parsed segment of a route pattern. */
interface PatternSegment {
  kind: 'literal' | 'param' | 'wildcard';
  value: string;
}

/**
 * Split a path into segments, ignoring empty components.
 * `"/a//b/"` -> `["a", "b"]`.
 */
function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

/**
 * Parse a pattern into typed segments.
 */
function parsePattern(pattern: string): PatternSegment[] {
  return splitPath(pattern).map((raw): PatternSegment => {
    if (raw === '*') {
      return { kind: 'wildcard', value: '*' };
    }
    if (raw.startsWith(':')) {
      return { kind: 'param', value: raw.slice(1) };
    }
    if (raw.startsWith('{') && raw.endsWith('}')) {
      return { kind: 'param', value: raw.slice(1, -1) };
    }
    return { kind: 'literal', value: raw };
  });
}

/**
 * Compare two version strings component-wise.
 * Non-numeric segments compare lexically. Missing trailing
 * components are treated as 0, so "1.2" < "1.2.1".
 *
 * Returns negative, zero, or positive.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i] ?? '0';
    const sb = pb[i] ?? '0';
    const na = Number(sa);
    const nb = Number(sb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Resolve the API version of a request.
 *
 * Resolution order:
 *  1. `x-api-version`-style header (name configurable per constraint)
 *  2. `Accept` header media-range parameter `version=`
 *  3. `version` query parameter
 *  4. `v\d+` prefix of the first path segment
 */
export function extractRequestVersion(
  headers: Record<string, string[]>,
  query: Record<string, string>,
  path: string,
  constraint?: RouteVersionConstraint
): string | undefined {
  const headerName = (constraint?.header ?? 'x-api-version').toLowerCase();
  const hv = headers[headerName];
  if (hv && hv.length > 0 && hv[0]!.trim().length > 0) {
    return hv[0]!.trim();
  }

  const accept = headers['accept'];
  if (accept) {
    for (const line of accept) {
      const m = /(?:^|;)\s*version=([^;\s]+)/i.exec(line);
      if (m) return m[1]!.trim();
    }
  }

  if (query['version']) {
    return query['version'];
  }

  const first = splitPath(path)[0];
  if (first && /^v\d+(\.\d+)*$/i.test(first)) {
    return first.slice(1);
  }

  return undefined;
}

/**
 * Check whether a resolved version satisfies a route constraint.
 */
export function versionSatisfies(
  version: string | undefined,
  constraint: RouteVersionConstraint | undefined
): boolean {
  if (!constraint) return true;
  const v = version ?? constraint.default;
  if (v === undefined) {
    return !constraint.required;
  }
  if (constraint.exact !== undefined && compareVersions(v, constraint.exact) !== 0) {
    return false;
  }
  if (constraint.min !== undefined && compareVersions(v, constraint.min) < 0) {
    return false;
  }
  if (constraint.max !== undefined && compareVersions(v, constraint.max) > 0) {
    return false;
  }
  return true;
}

/**
 * Gateway Route Matcher.
 *
 * Maintains one trie over all registered path patterns and resolves
 * the winning route for each request, honoring method, version and
 * specificity rules.
 */
export class RouteMatcher {
  private _root: TrieNode;
  private _routes: Map<string, RouteRegistration>;
  private _seq: number;
  private _random: RandomSource;
  private _canaryRules: CanaryRules | undefined;

  constructor(random?: RandomSource) {
    this._root = { literal: new Map(), routes: [] };
    this._routes = new Map();
    this._seq = 0;
    this._random = random ?? new DefaultRandomSource();
  }

  /** Configure canary routing policy applied during upstream selection. */
  setCanaryRules(rules: CanaryRules | undefined): void {
    this._canaryRules = rules;
  }

  /**
   * Register a route. Re-registering the same id replaces the entry.
   */
  register(route: GatewayRoute): void {
    this.unregister(route.id);
    const segments = parsePattern(route.pathPattern);
    const literalCount = segments.filter((s) => s.kind === 'literal').length;
    const reg: RouteRegistration = { route, literalCount, seq: this._seq++ };
    this._routes.set(route.id, reg);

    let node = this._root;
    for (const seg of segments) {
      if (seg.kind === 'literal') {
        let child = node.literal.get(seg.value);
        if (!child) {
          child = { literal: new Map(), routes: [] };
          node.literal.set(seg.value, child);
        }
        node = child;
      } else if (seg.kind === 'param') {
        if (!node.param) {
          node.param = { name: seg.value, node: { literal: new Map(), routes: [] } };
        }
        node = node.param.node;
      } else {
        if (!node.wildcard) {
          node.wildcard = { literal: new Map(), routes: [] };
        }
        node = node.wildcard;
      }
    }
    node.routes.push(reg);
  }

  /**
   * Remove a route by id. Returns true when it existed.
   */
  unregister(routeId: string): boolean {
    const reg = this._routes.get(routeId);
    if (!reg) return false;
    this._routes.delete(routeId);
    // Walk the trie and remove the registration reference.
    const segments = parsePattern(reg.route.pathPattern);
    const path: TrieNode[] = [this._root];
    let node = this._root;
    for (const seg of segments) {
      if (seg.kind === 'literal') {
        const child = node.literal.get(seg.value);
        if (!child) return true;
        node = child;
      } else if (seg.kind === 'param') {
        if (!node.param) return true;
        node = node.param.node;
      } else {
        if (!node.wildcard) return true;
        node = node.wildcard;
      }
      path.push(node);
    }
    node.routes = node.routes.filter((r) => r.route.id !== routeId);
    return true;
  }

  /** Number of registered routes. */
  size(): number {
    return this._routes.size;
  }

  /**
   * Find the best matching route for a request.
   *
   * Collects all pattern matches via DFS over literal > param >
   * wildcard branches (capturing params), then filters by method and
   * version, then picks the most specific winner.
   *
   * Returns undefined when nothing matches.
   */
  match(input: {
    method: string;
    path: string;
    headers: Record<string, string[]>;
    query: Record<string, string>;
    consumerGroup?: string;
  }): RouteMatch | undefined {
    const segments = splitPath(input.path);
    const candidates: { reg: RouteRegistration; params: Record<string, string> }[] = [];
    this._collect(this._root, segments, 0, {}, candidates);
    if (candidates.length === 0) return undefined;

    const method = input.method.toUpperCase();
    const filtered = candidates.filter(({ reg }) => {
      const r = reg.route;
      if (r.methods.length > 0 && !r.methods.map((m) => m.toUpperCase()).includes(method)) {
        return false;
      }
      const version = extractRequestVersion(input.headers, input.query, input.path, r.version);
      return versionSatisfies(version, r.version);
    });
    if (filtered.length === 0) return undefined;

    // Most literal segments wins; then explicit priority; then earliest seq.
    filtered.sort((a, b) => {
      if (a.reg.literalCount !== b.reg.literalCount) {
        return b.reg.literalCount - a.reg.literalCount;
      }
      const pa = a.reg.route.priority ?? 0;
      const pb = b.reg.route.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return a.reg.seq - b.reg.seq;
    });

    const winner = filtered[0]!;
    const route = winner.reg.route;
    const apiVersion = extractRequestVersion(
      input.headers,
      input.query,
      input.path,
      route.version
    );
    const upstream = this._selectUpstream(route, input);
    if (!upstream) return undefined;
    return { route, params: winner.params, apiVersion, upstream };
  }

  /**
   * Depth-first collection of all candidate registrations.
   * Literal children are preferred but every branch is explored so
   * that a param route further down still counts when literal fails.
   */
  private _collect(
    node: TrieNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
    out: { reg: RouteRegistration; params: Record<string, string> }[]
  ): void {
    // Wildcard matches the remainder (zero or more segments).
    if (node.wildcard) {
      for (const reg of node.wildcard.routes) {
        out.push({ reg, params: { ...params } });
      }
    }
    if (index >= segments.length) {
      for (const reg of node.routes) {
        out.push({ reg, params: { ...params } });
      }
      return;
    }
    const seg = segments[index]!;
    const literalChild = node.literal.get(seg);
    if (literalChild) {
      this._collect(literalChild, segments, index + 1, params, out);
    }
    if (node.param) {
      const next = { ...params, [node.param.name]: seg };
      this._collect(node.param.node, segments, index + 1, next, out);
    }
  }

  /**
   * Choose an upstream for a route using canary rules and weights.
   *
   * Canary selection order:
   *  1. Forcing header match -> canary upstreams
   *  2. Consumer group match -> canary upstreams
   *  3. Deterministic percentage roll -> canary upstreams
   * Otherwise weighted-random among non-canary upstreams.
   */
  private _selectUpstream(
    route: GatewayRoute,
    input: { headers: Record<string, string[]>; consumerGroup?: string }
  ): GatewayUpstream | undefined {
    const upstreams = route.upstreams;
    if (upstreams.length === 0) return undefined;
    if (upstreams.length === 1) return upstreams[0];

    const canaries = upstreams.filter((u) => u.canary);
    const stable = upstreams.filter((u) => !u.canary);
    const rules = this._canaryRules;

    let wantCanary = false;
    if (rules && canaries.length > 0) {
      if (rules.header) {
        const vals = input.headers[rules.header.toLowerCase()];
        if (vals && (rules.headerValue === undefined || vals.includes(rules.headerValue))) {
          wantCanary = true;
        }
      }
      if (!wantCanary && rules.group && input.consumerGroup === rules.group) {
        wantCanary = true;
      }
      if (!wantCanary && rules.weightPercent !== undefined) {
        wantCanary = this._random.next() * 100 < rules.weightPercent;
      }
    }

    const pool = wantCanary && canaries.length > 0 ? canaries : stable.length > 0 ? stable : upstreams;
    return this._weightedPick(pool);
  }

  /**
   * Weighted-random pick. Weight defaults to 1; total weight is the
   * denominator. O(n) scan over cumulative weights.
   */
  private _weightedPick(pool: readonly GatewayUpstream[]): GatewayUpstream {
    let total = 0;
    for (const u of pool) total += u.weight ?? 1;
    let roll = this._random.next() * total;
    for (const u of pool) {
      roll -= u.weight ?? 1;
      if (roll < 0) return u;
    }
    return pool[pool.length - 1]!;
  }
}
