/**
 * Radix Trie Router
 *
 * Compressed-trie (radix tree) router with parametric `:param` and
 * terminal wildcard `*` segments, specificity scoring, per-method
 * dispatch, and structural 405 detection.
 *
 * Data structure:
 * - Edges carry arbitrary *string* labels (not single chars) — the
 *   "compressed" property. Single-child static chains merge into one
 *   edge, so `/api/v1/health` may occupy a single edge.
 * - Each node holds: a map of static child edges (keyed by first
 *   character for O(1) branching), up to one `:param` edge set, and at
 *   most one terminal `*` wildcard edge.
 * - Route registrations hang off nodes per HTTP method — the trie
 *   shape itself is method-agnostic, so a single tree serves all
 *   methods and a `POST /x` on a `GET`-only path still resolves the
 *   node (enabling 405 with the allowed-method list).
 *
 * Insertion complexity: O(L) where L = pattern length — one longest-
 * common-prefix walk plus at most one edge split per static chunk.
 * Lookup: O(P · k) worst case with backtracking (P = path length,
 * k = param/wildcard fanout at each level); typical case is O(P)
 * because static edges match exactly or not at all.
 *
 * Specificity score: `3 · staticChars + 2 · paramCount + 1 · wildcardCount`.
 * Static text dominates params which dominate wildcards. The search
 * walks branches in specificity order (static → param → wildcard), so
 * the best match is usually the first found; the score still breaks
 * ties between structurally different candidates.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import {
  EngineMatch,
  EngineRoute,
  MatchResult,
  RouteHandler,
  RouteMiddleware,
  RouteRequest,
  RouteResult,
} from './types';

/** Tokens produced by pattern tokenization. */
type PatternToken =
  | { readonly kind: 'static'; readonly text: string }
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'wildcard'; readonly name: string };

/** Child edge descriptor — three structural kinds. */
interface ParamEdge {
  readonly name: string;
  readonly node: TrieNode;
}

interface WildcardEdge {
  readonly name: string;
  readonly node: TrieNode;
}

/** Trie node. `edge` is the label on the edge *entering* this node. */
class TrieNode {
  /** Edge label from the parent ('' for the root). */
  edge: string;
  /** Static child edges, keyed by their first character. */
  staticChildren: Map<string, TrieNode>;
  /** Param children — a path segment may match one of several names. */
  paramChildren: ParamEdge[];
  /** Terminal wildcard child (`*rest`). */
  wildcardChild: WildcardEdge | null;
  /** Registered routes at this node, keyed by HTTP method. */
  routes: Map<HttpMethod, RegisteredRoute>;
  /** Registered patterns reachable below this node (for debugging). */
  depth: number;

  constructor(edge: string, depth: number) {
    this.edge = edge;
    this.staticChildren = new Map();
    this.paramChildren = [];
    this.wildcardChild = null;
    this.routes = new Map();
    this.depth = depth;
  }
}

/** Route plus its pre-composed middleware pipeline. */
interface RegisteredRoute {
  readonly route: EngineRoute;
  /** handler wrapped by the ordered middleware chain (reduceRight). */
  readonly pipeline: RouteHandler;
}

/** Registration conflict error. */
export class RouteConflictError extends Error {
  constructor(method: HttpMethod, path: string) {
    super(`Route already registered: ${method} ${path}`);
    this.name = 'RouteConflictError';
  }
}

/**
 * Tokenize a path pattern into static / param / wildcard tokens.
 *
 * Rules:
 * - `:name` begins a param token ending at the next `/` or EOL.
 * - `*` optionally followed by a name consumes the remainder — it must
 *   be the last token (mid-pattern wildcards are rejected).
 * - Everything else is a static chunk; consecutive static text merges.
 */
export function tokenizePattern(pattern: string): PatternToken[] {
  if (pattern.length === 0 || !pattern.startsWith('/')) {
    throw new Error(`Route pattern must start with '/': "${pattern}"`);
  }
  const tokens: PatternToken[] = [];
  let i = 0;
  let staticStart = 0;

  const flushStatic = (end: number): void => {
    if (end > staticStart) {
      tokens.push({ kind: 'static', text: pattern.slice(staticStart, end) });
    }
  };

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === ':') {
      flushStatic(i);
      const nameStart = ++i;
      while (i < pattern.length && /[A-Za-z0-9_]/.test(pattern[i])) {
        i++;
      }
      const name = pattern.slice(nameStart, i);
      if (name.length === 0) {
        throw new Error(`Empty param name in pattern "${pattern}" at offset ${nameStart - 1}`);
      }
      tokens.push({ kind: 'param', name });
      staticStart = i;
    } else if (ch === '*') {
      flushStatic(i);
      i++;
      const nameStart = i;
      while (i < pattern.length && /[A-Za-z0-9_]/.test(pattern[i])) {
        i++;
      }
      tokens.push({ kind: 'wildcard', name: pattern.slice(nameStart, i) || 'wildcard' });
      if (i < pattern.length) {
        throw new Error(`Wildcard must be the last segment in pattern "${pattern}"`);
      }
      staticStart = i;
    } else {
      i++;
    }
  }
  flushStatic(pattern.length);
  return tokens;
}

/** Length of the common prefix of `a` and `b`. */
function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) {
    i++;
  }
  return i;
}

/** Specificity weights per token kind. */
const SCORE_STATIC_CHAR = 3;
const SCORE_PARAM = 2;
const SCORE_WILDCARD = 1;

interface SearchState {
  pos: number;
  node: TrieNode;
  params: Record<string, string>;
  wildcard?: string;
  score: number;
}

/**
 * Radix trie router — method-agnostic path trie + per-method route map.
 */
export class RadixTrieRouter {
  private readonly _root: TrieNode;
  private _routeCount: number;

  constructor() {
    this._root = new TrieNode('', 0);
    this._routeCount = 0;
  }

  /** Number of registered routes. */
  get routeCount(): number {
    return this._routeCount;
  }

  // ------------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------------

  /**
   * Register a route. Throws {@link RouteConflictError} when the same
   * (method, pattern) pair already exists.
   */
  addRoute(route: EngineRoute): void {
    const tokens = tokenizePattern(route.path);
    const node = this._insert(tokens);
    if (node.routes.has(route.method)) {
      throw new RouteConflictError(route.method, route.path);
    }
    node.routes.set(route.method, {
      route,
      pipeline: composePipeline(route.middleware ?? [], route.handler),
    });
    this._routeCount++;
  }

  /**
   * Remove a route. Returns true when a route was removed.
   * (Dead nodes are left in place — cheap, keeps removal O(L).)
   */
  removeRoute(method: HttpMethod, pattern: string): boolean {
    const tokens = tokenizePattern(pattern);
    const node = this._locate(tokens);
    if (node === null) {
      return false;
    }
    const removed = node.routes.delete(method);
    if (removed) {
      this._routeCount--;
    }
    return removed;
  }

  // ------------------------------------------------------------------------
  // Lookup
  // ------------------------------------------------------------------------

  /**
   * Resolve `method + path` into a match / miss / 405 outcome.
   *
   * Walks the trie preferring static edges, then params, then wildcard.
   * Records the best-scoring candidate leaf; when the leaf has no route
   * for `method`, reports `method_not_allowed` with the leaf's methods.
   */
  match(method: HttpMethod, path: string): MatchResult {
    const best = this._findBest(path);

    if (best === null) {
      return { kind: 'not_found' };
    }

    const registered = best.node.routes.get(method);
    if (registered === undefined) {
      return {
        kind: 'method_not_allowed',
        allowedMethods: [...best.node.routes.keys()],
        closestPattern: best.pattern,
      };
    }

    const request: RouteRequest = {
      method,
      path,
      params: best.params,
      matchedPattern: registered.route.path,
      headers: {},
      state: {},
    };
    const req: RouteRequest =
      best.wildcard !== undefined ? { ...request, wildcard: best.wildcard } : request;

    const match: EngineMatch = {
      route: registered.route,
      specificity: best.score,
      request: req,
    };
    return { kind: 'matched', match };
  }

  /**
   * Dispatch a request through the matched route's pipeline.
   *
   * @returns Handler result, or a 404/405-shaped `RouteResult`.
   */
  async dispatch(
    method: HttpMethod,
    path: string,
    headers: Record<string, string> = {},
    state: Record<string, unknown> = {}
  ): Promise<RouteResult & { matchedPattern?: string }> {
    void state;
    const best = this._findBest(path);
    if (best === null) {
      return { status: 404, body: { error: 'Not Found', path } };
    }
    const registered = best.node.routes.get(method);
    if (registered === undefined) {
      const allowed = [...best.node.routes.keys()].join(', ');
      return {
        status: 405,
        body: { error: 'Method Not Allowed', allowedMethods: allowed },
        headers: { allow: allowed },
        matchedPattern: best.pattern,
      };
    }
    const request: RouteRequest = {
      method,
      path,
      params: best.params,
      matchedPattern: registered.route.path,
      headers,
      state,
    };
    const req = best.wildcard !== undefined ? { ...request, wildcard: best.wildcard } : request;
    const result = await registered.pipeline(req);
    return { ...result, matchedPattern: registered.route.path };
  }

  /**
   * Enumerate all methods that would match `path` at the best node —
   * the canonical 405 helper.
   */
  allowedMethods(path: string): readonly HttpMethod[] {
    const best = this._findBest(path);
    return best === null ? [] : [...best.node.routes.keys()];
  }

  /**
   * Depth of the deepest trie node — diagnostic for compression ratio.
   */
  maxDepth(): number {
    let max = 0;
    const walk = (node: TrieNode): void => {
      if (node.depth > max) {
        max = node.depth;
      }
      for (const child of node.staticChildren.values()) {
        walk(child);
      }
      for (const p of node.paramChildren) {
        walk(p.node);
      }
      if (node.wildcardChild !== null) {
        walk(node.wildcardChild.node);
      }
    };
    walk(this._root);
    return max;
  }

  /**
   * Total node count — reflects compression (fewer nodes than the sum
   * of pattern characters when routes share prefixes).
   */
  nodeCount(): number {
    let count = 0;
    const walk = (node: TrieNode): void => {
      count++;
      for (const child of node.staticChildren.values()) {
        walk(child);
      }
      for (const p of node.paramChildren) {
        walk(p.node);
      }
      if (node.wildcardChild !== null) {
        walk(node.wildcardChild.node);
      }
    };
    walk(this._root);
    return count;
  }

  // ------------------------------------------------------------------------
  // Insert internals
  // ------------------------------------------------------------------------

  /**
   * Walk tokens into the trie, creating/splitting nodes as needed, and
   * return the terminal node the pattern resolves to.
   */
  private _insert(tokens: PatternToken[]): TrieNode {
    let node = this._root;
    for (const token of tokens) {
      if (token.kind === 'static') {
        node = this._insertStatic(node, token.text);
      } else if (token.kind === 'param') {
        node = this._insertParam(node, token.name);
      } else {
        node = this._insertWildcard(node, token.name);
      }
    }
    return node;
  }

  /**
   * Consume a static chunk from `node`, splitting edges on the longest
   * common prefix when an existing edge partially matches.
   */
  private _insertStatic(node: TrieNode, text: string): TrieNode {
    let remaining = text;
    let current = node;

    while (remaining.length > 0) {
      const firstChar = remaining[0];
      const child = current.staticChildren.get(firstChar);
      if (child === undefined) {
        // No sharing: hang the whole remainder as one edge.
        const leaf = new TrieNode(remaining, current.depth + 1);
        current.staticChildren.set(remaining[0], leaf);
        return leaf;
      }

      const cpl = commonPrefixLength(child.edge, remaining);
      if (cpl === child.edge.length) {
        // Existing edge fully consumed — descend.
        remaining = remaining.slice(cpl);
        current = child;
        continue;
      }

      // Split: parent's edge keeps cpl chars; the old edge tail becomes
      // a child of the split point; the new remainder becomes a sibling.
      const edgePrefix = child.edge.slice(0, cpl);
      const edgeSuffix = child.edge.slice(cpl);

      const split = new TrieNode(edgePrefix, current.depth + 1);
      current.staticChildren.set(edgePrefix[0], split);
      child.edge = edgeSuffix;
      child.depth = split.depth + 1;
      split.staticChildren.set(edgeSuffix[0], child);

      if (cpl < remaining.length) {
        // Remainder diverges inside the old edge — new leaf off split.
        const tail = remaining.slice(cpl);
        const leaf = new TrieNode(tail, split.depth + 1);
        split.staticChildren.set(tail[0], leaf);
        return leaf;
      }
      return split;
    }
    return current;
  }

  private _insertParam(node: TrieNode, name: string): TrieNode {
    const existing = node.paramChildren.find((p) => p.name === name);
    if (existing !== undefined) {
      return existing.node;
    }
    const child = new TrieNode(`:${name}`, node.depth + 1);
    node.paramChildren.push({ name, node: child });
    return child;
  }

  private _insertWildcard(node: TrieNode, name: string): TrieNode {
    if (node.wildcardChild !== null && node.wildcardChild.name !== name) {
      throw new Error(
        `Wildcard name conflict at this level: "${node.wildcardChild.name}" vs "${name}"`
      );
    }
    if (node.wildcardChild === null) {
      const child = new TrieNode('*', node.depth + 1);
      node.wildcardChild = { name, node: child };
    }
    return node.wildcardChild.node;
  }

  /**
   * Locate the node a pattern resolves to, or null when it isn't
   * registered (used by removeRoute — no splits, pure walk).
   */
  private _locate(tokens: PatternToken[]): TrieNode | null {
    let node = this._root;
    for (const token of tokens) {
      if (token.kind === 'static') {
        let remaining = token.text;
        while (remaining.length > 0) {
          const child = node.staticChildren.get(remaining[0]);
          if (child === undefined) {
            return null;
          }
          const cpl = commonPrefixLength(child.edge, remaining);
          if (cpl < child.edge.length) {
            return null;
          }
          remaining = remaining.slice(cpl);
          node = child;
        }
      } else if (token.kind === 'param') {
        const edge = node.paramChildren.find((p) => p.name === token.name);
        if (edge === undefined) {
          return null;
        }
        node = edge.node;
      } else {
        if (node.wildcardChild === null) {
          return null;
        }
        node = node.wildcardChild.node;
      }
    }
    return node;
  }

  // ------------------------------------------------------------------------
  // Match internals — DFS with specificity-ordered branching
  // ------------------------------------------------------------------------

  /**
   * Depth-first search in specificity order: at each node try static
   * edges first, then each param child, then the wildcard. The first
   * hit with the highest score wins; scores make the preference
   * explicit and support later tie-breaking / reporting.
   */
  private _findBest(
    path: string
  ): { node: TrieNode; params: Record<string, string>; wildcard?: string; score: number; pattern: string } | null {
    let best: {
      node: TrieNode;
      params: Record<string, string>;
      wildcard?: string;
      score: number;
      pattern: string;
    } | null = null;

    const visit = (state: SearchState): void => {
      const { node, pos } = state;

      // Terminal: consumed the whole path at a node holding routes.
      if (pos === path.length && node.routes.size > 0) {
        const candidate = {
          node,
          params: { ...state.params },
          score: state.score,
          pattern: reconstructPattern(node),
        };
        const candidateFinal =
          state.wildcard !== undefined ? { ...candidate, wildcard: state.wildcard } : candidate;
        if (best === null || candidateFinal.score > best.score) {
          best = candidateFinal;
        }
        // Keep walking siblings — a later branch might outscore this.
      }
      if (pos >= path.length) {
        // Nothing left to consume except maybe a trailing wildcard.
        if (node.wildcardChild !== null && node.wildcardChild.node.routes.size > 0) {
          const wc = node.wildcardChild;
          const score = state.score + SCORE_WILDCARD;
          const candidate = {
            node: wc.node,
            params: { ...state.params },
            wildcard: '',
            score,
            pattern: reconstructPattern(wc.node),
          };
          if (best === null || candidate.score > best.score) {
            best = candidate;
          }
        }
        return;
      }

      // 1. Static edge — must fully match its label.
      const child = node.staticChildren.get(path[pos]);
      if (child !== undefined) {
        const cpl = commonPrefixLength(child.edge, path.slice(pos, pos + child.edge.length));
        if (cpl === child.edge.length) {
          visit({
            node: child,
            pos: pos + cpl,
            params: state.params,
            wildcard: state.wildcard,
            score: state.score + SCORE_STATIC_CHAR * cpl,
          });
        }
      }

      // 2. Param edges — capture [pos, next '/') or [pos, end].
      if (node.paramChildren.length > 0) {
        let end = path.indexOf('/', pos);
        if (end === -1) {
          end = path.length;
        }
        if (end > pos) {
          const value = path.slice(pos, end);
          for (const param of node.paramChildren) {
            const nextParams = { ...state.params };
            nextParams[param.name] = value;
            visit({
              node: param.node,
              pos: end,
              params: nextParams,
              wildcard: state.wildcard,
              score: state.score + SCORE_PARAM,
            });
          }
        }
      }

      // 3. Wildcard — captures the entire remainder (terminal).
      if (node.wildcardChild !== null) {
        const wc = node.wildcardChild;
        if (wc.node.routes.size > 0) {
          const score = state.score + SCORE_WILDCARD;
          const candidate = {
            node: wc.node,
            params: { ...state.params },
            wildcard: path.slice(pos),
            score,
            pattern: reconstructPattern(wc.node),
          };
          if (best === null || candidate.score > best.score) {
            best = candidate;
          }
        }
      }
    };

    visit({ pos: 0, node: this._root, params: {}, score: 0 });
    return best;
  }
}

/**
 * Reconstruct the registered pattern from a terminal node by walking
 * up... — the trie has no parent pointers, so we can't. Instead we
 * keep a marker: nodes' edges give the tail; the full pattern is
 * recovered from the route's own `path` at the leaf. This helper is
 * used for 405 reporting where the *closest pattern* is approximated
 * by the matched leaf's first registered route path.
 */
function reconstructPattern(node: TrieNode): string {
  for (const registered of node.routes.values()) {
    return registered.route.path;
  }
  return node.edge;
}

/**
 * Compose a route's middleware + handler into a single handler.
 * reduceRight builds an onion: middleware[0] outermost.
 */
export function composePipeline(
  middleware: readonly RouteMiddleware[],
  handler: RouteHandler
): RouteHandler {
  return middleware.reduceRight<RouteHandler>(
    (next, mw) => (request) => mw(request, () => next(request)),
    handler
  );
}
