/**
 * Route Constraints — regex-validated path segments + host matching.
 *
 * Extends the radix engine with two orthogonal gates evaluated at
 * match time:
 *
 *   - **Param constraints** — `:id<\d+>` means `:id` only matches
 *     digits. Patterns like `/files/:name<\.(png|jpe?g)$>` reject
 *     `/files/x.txt` without touching the handler. Constraints are
 *     compiled once at registration and cached.
 *   - **Host constraints** — `{sub}.api.example.com` or literal
 *     `admin.localhost` dispatch only when the request's `Host`
 *     header matches. Host variables capture like path params.
 *
 * Structure: every host bucket keeps TWO radix tries — a constrained
 * trie (routes with ≥1 param constraint) and a free trie. The
 * constrained trie is probed first; a constraint failure falls through
 * to the free trie, which is how `/items/:id<int>` loses to
 * `/items/:name` for `GET /items/abc` while still winning `/items/7`.
 *
 * Specificity order overall:
 *   hosted bucket (desc host specificity) → constrained trie → free trie
 *   → agnostic bucket (constrained → free).
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { RadixTrieRouter, RouteConflictError } from './RadixTrieRouter';
import { EngineRoute, MatchResult, RouteResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A host matcher: literal prefix/suffix around optional {var} slots. */
export interface HostPattern {
  /** Original pattern string, e.g. `{tenant}.internal.example.com`. */
  readonly raw: string;
  /** Compiled segment list (literal strings / variable names). */
  readonly parts: readonly HostPart[];
  /** Specificity score — number of literal characters. */
  readonly specificity: number;
}

export type HostPart =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'variable'; readonly name: string };

/** Compiled param constraint. */
export interface ParamConstraint {
  /** Param name (without `:`). */
  readonly name: string;
  /** Compiled matcher — anchored regex. */
  readonly regex: RegExp;
  /** Human-readable raw pattern (`\d+`, `int`, ...). */
  readonly raw: string;
}

/** Constraint-aware route definition. */
export interface ConstrainedRoute extends EngineRoute {
  /** Host pattern (`{tenant}.internal`); undefined = host-agnostic. */
  readonly host?: string;
  /** Param constraints — `{ id: '\\d+' }` or shorthand `{ id: 'int' }`. */
  readonly constraints?: Readonly<Record<string, string | RegExp>>;
}

/** Result of host matching. */
export interface HostMatch {
  readonly matched: boolean;
  readonly variables: Record<string, string>;
  readonly specificity: number;
}

/** Built-in shorthand constraints (framework-convention names). */
const BUILTIN_CONSTRAINTS: Readonly<Record<string, string>> = {
  int: '\\d+',
  uint: '\\d+',
  float: '-?\\d+(?:\\.\\d+)?',
  number: '-?\\d+(?:\\.\\d+)?',
  uuid: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
  slug: '[a-z0-9]+(?:-[a-z0-9]+)*',
  alpha: '[a-zA-Z]+',
  alnum: '[a-zA-Z0-9]+',
  hex: '[0-9a-fA-F]+',
  date: '\\d{4}-\\d{2}-\\d{2}',
  datetime: '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
  version: 'v\\d+',
  any: '[^/]+',
};

// ---------------------------------------------------------------------------
// Host pattern compiler
// ---------------------------------------------------------------------------

/**
 * Compile a host pattern into literal/variable parts.
 *
 * Grammar: `{var}` captures a label-run; everything else is literal.
 * `{tenant}.api.example.com` → `[var tenant, '.api.example.com']`.
 * `'*'` alone matches any host.
 */
export function compileHostPattern(raw: string): HostPattern {
  if (raw === '' || raw === '*') {
    return { raw, parts: [{ kind: 'variable', name: '_wildcardHost' }], specificity: 0 };
  }

  const parts: HostPart[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '{') {
      const close = raw.indexOf('}', i + 1);
      if (close < 0) {
        throw new Error(`Unclosed host variable in '${raw}'`);
      }
      const name = raw.slice(i + 1, close);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Invalid host variable name '${name}' in '${raw}'`);
      }
      parts.push({ kind: 'variable', name });
      i = close + 1;
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j] !== '{') {
      j++;
    }
    parts.push({ kind: 'literal', text: raw.slice(i, j) });
    i = j;
  }

  // Merge adjacent literals — keeps specificity math clean.
  const merged: HostPart[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (p.kind === 'literal' && last?.kind === 'literal') {
      merged[merged.length - 1] = { kind: 'literal', text: last.text + p.text };
    } else {
      merged.push(p);
    }
  }

  const specificity = merged.reduce(
    (acc, p) => (p.kind === 'literal' ? acc + p.text.length : acc),
    0
  );
  return { raw, parts: merged, specificity };
}

/**
 * Match a concrete host against a compiled pattern.
 *
 * Bounded backtracker over (part-index, host-offset): literals must
 * prefix-match; variables try label-boundary end positions, longest
 * first (leftmost-greedy). Variables may span dots, so `{sub}` can
 * capture `a.b`. Worst case O(#labels²) — hosts are short, fine.
 */
export function matchHost(pattern: HostPattern, host: string): HostMatch | null {
  const variables: Record<string, string> = {};
  const lower = host.toLowerCase();

  const tryMatch = (pi: number, pos: number): boolean => {
    if (pi >= pattern.parts.length) {
      return pos === lower.length;
    }
    const part = pattern.parts[pi];
    if (part.kind === 'literal') {
      const lit = part.text.toLowerCase();
      if (!lower.startsWith(lit, pos)) {
        return false;
      }
      return tryMatch(pi + 1, pos + lit.length);
    }
    // Variable — candidate end positions are bounded by the NEXT
    // literal part. For a trailing variable the only legal end is
    // end-of-string; otherwise the variable stops just before each
    // occurrence of the next literal (longest-first = leftmost-greedy).
    const isLast = pi === pattern.parts.length - 1;
    const candidates: number[] = [];
    if (isLast) {
      candidates.push(lower.length);
    } else {
      const nextPart = pattern.parts[pi + 1];
      if (nextPart.kind === 'literal') {
        const lit = nextPart.text.toLowerCase();
        let from = pos + 1;
        while (true) {
          const idx = lower.indexOf(lit, from);
          if (idx < 0) {
            break;
          }
          if (idx > pos) {
            candidates.push(idx);
          }
          from = idx + 1;
        }
      } else {
        // Variable followed by another variable — boundary can be any
        // position; the recursion resolves the split.
        for (let end = lower.length; end > pos; end--) {
          candidates.push(end);
        }
      }
      // Longest-first when the next literal appears multiple times.
      candidates.sort((a, b) => b - a);
    }
    for (const end of candidates) {
      const slice = lower.slice(pos, end);
      if (slice.startsWith('.') || slice.endsWith('.')) {
        continue;
      }
      const saved = variables[part.name];
      variables[part.name] = slice;
      if (tryMatch(pi + 1, end)) {
        return true;
      }
      if (saved === undefined) {
        delete variables[part.name];
      } else {
        variables[part.name] = saved;
      }
    }
    return false;
  };

  if (!tryMatch(0, 0)) {
    return null;
  }
  return { matched: true, variables, specificity: pattern.specificity };
}

// ---------------------------------------------------------------------------
// Param constraint compiler
// ---------------------------------------------------------------------------

/**
 * Parse a path pattern containing `:name<regex>` / `:name<builtin>`
 * segments, returning the rewritten pattern (constraints stripped so
 * the radix tokenizer accepts it) plus the compiled constraints.
 *
 * The radix tokenizer stops a param name at the first non-word char,
 * so constraint extraction must happen BEFORE tokenization — this
 * scanner handles `:` params and `<...>` constraint bodies itself.
 */
export function parseConstrainedPattern(path: string): {
  readonly path: string;
  readonly constraints: readonly ParamConstraint[];
} {
  const constraints: ParamConstraint[] = [];
  const out: string[] = [];
  let i = 0;

  while (i < path.length) {
    const ch = path[i];
    if (ch === ':') {
      // Read param name.
      let j = i + 1;
      while (j < path.length && /[A-Za-z0-9_]/.test(path[j])) {
        j++;
      }
      const name = path.slice(i + 1, j);
      out.push(`:${name}`);
      i = j;
      // Optional `<constraint>` — must close before the next '/'.
      if (path[i] === '<') {
        const slash = path.indexOf('/', i);
        const close = path.lastIndexOf('>', slash === -1 ? path.length : slash);
        if (close <= i) {
          throw new Error(`Unclosed constraint in path '${path}' at offset ${i}`);
        }
        const raw = path.slice(i + 1, close);
        const resolved = BUILTIN_CONSTRAINTS[raw] ?? raw;
        let regex: RegExp;
        try {
          regex = new RegExp(`^(?:${resolved})$`);
        } catch {
          throw new Error(`Invalid constraint regex '${raw}' in path '${path}'`);
        }
        constraints.push({ name, regex, raw });
        i = close + 1;
      }
      continue;
    }
    out.push(ch);
    i++;
  }

  return { path: out.join(''), constraints };
}

// ---------------------------------------------------------------------------
// Constrained router
// ---------------------------------------------------------------------------

/**
 * Pair of tries per bucket — constrained probed before free. Each
 * side carries its own constraint index: a free `/items/:id` and a
 * constrained `/items/:id<int>` rewrite to the same pattern, so the
 * rules can't be keyed by rewritten path globally.
 */
interface TriePair {
  readonly constrained: RadixTrieRouter;
  readonly free: RadixTrieRouter;
  readonly constrainedIdx: ConstraintIndex;
  readonly freeIdx: ConstraintIndex;
}

interface HostedBucket {
  readonly pattern: HostPattern;
  readonly tries: TriePair;
}

/** Internal constraint index: `method + ' ' + rewrittenPath` → rules. */
type ConstraintIndex = Map<string, readonly ParamConstraint[]>;

function makeTriePair(): TriePair {
  return {
    constrained: new RadixTrieRouter(),
    free: new RadixTrieRouter(),
    constrainedIdx: new Map(),
    freeIdx: new Map(),
  };
}

/**
 * Constrained route engine.
 *
 * Buckets:
 *   - hosted[]  — one TriePair per distinct host pattern, sorted by
 *     host specificity descending.
 *   - agnostic  — routes without a host constraint.
 *
 * Dispatch order: hosted buckets (most specific host first) ×
 * [constrained, free], then the agnostic pair. A trie hit that fails
 * its param constraint is treated as a miss and the probe continues.
 *
 * Note: within a single trie, sibling param edges with different names
 * resolve in insertion order — overlapping *constrained* routes on the
 * same position (`:id<int>` + `:slug<slug>`) see only the trie's best
 * pick. Separate the param names by segment position to avoid the
 * ambiguity.
 */
export class ConstrainedRouterEngine {
  private readonly _agnostic: TriePair;
  private readonly _hosted: HostedBucket[];
  private readonly _catalog: ConstraintIndex;

  constructor() {
    this._agnostic = makeTriePair();
    this._hosted = [];
    this._catalog = new Map();
  }

  /** Register a constrained route. */
  addRoute(route: ConstrainedRoute): void {
    const { path: rewritten, constraints: inline } = parseConstrainedPattern(route.path);
    const named: ParamConstraint[] = [];
    if (route.constraints !== undefined) {
      for (const [name, rawOrRe] of Object.entries(route.constraints)) {
        const raw = rawOrRe instanceof RegExp ? rawOrRe.source : rawOrRe;
        const resolved = rawOrRe instanceof RegExp ? rawOrRe.source : BUILTIN_CONSTRAINTS[raw] ?? raw;
        named.push({ name, regex: new RegExp(`^(?:${resolved})$`), raw });
      }
    }
    const all = [...inline, ...named];
    const key = `${route.method} ${rewritten}`;
    // Catalog keeps every registered constraint set for introspection;
    // the pair-scoped index keeps dispatch-time lookups unambiguous.
    this._catalog.set(key, all);

    const pair = route.host === undefined ? this._agnostic : this.bucketFor(route.host).tries;
    // Tag the registered route so dispatch can route the *same*
    // rewritten path to the correct trie — free `/items/:id` and
    // constrained `/items/:id<int>` collide on the rewritten key.
    const tagged: EngineRoute = {
      ...route,
      path: rewritten,
      metadata: { ...(route.metadata ?? {}), [TRIE_TAG]: all.length > 0 ? 'constrained' : 'free' },
    };
    if (all.length > 0) {
      pair.constrainedIdx.set(key, all);
      pair.constrained.addRoute(tagged);
    } else {
      pair.free.addRoute(tagged);
    }
  }

  /**
   * Dispatch honoring host + param constraints. 404-shaped on miss.
   */
  async dispatch(
    method: HttpMethod,
    path: string,
    host?: string,
    headers?: Record<string, string>,
    state?: Record<string, unknown>
  ): Promise<RouteResult & { matchedPattern?: string; hostVars?: Record<string, string> }> {
    if (host !== undefined && host !== '') {
      for (const bucket of this._hosted) {
        const hm = matchHost(bucket.pattern, host);
        if (hm === null) {
          continue;
        }
        const res = await this.probePair(bucket.tries, method, path, headers, state);
        if (res !== null) {
          return { ...res, hostVars: hm.variables };
        }
      }
    }
    const res = await this.probePair(this._agnostic, method, path, headers, state);
    if (res !== null) {
      return res;
    }
    return { status: 404, body: { error: 'not_found' } };
  }

  /** Dry-run match — diagnostics. */
  match(
    method: HttpMethod,
    path: string,
    host?: string
  ): MatchResult & { hostVars?: Record<string, string> } {
    if (host !== undefined && host !== '') {
      for (const bucket of this._hosted) {
        const hm = matchHost(bucket.pattern, host);
        if (hm === null) {
          continue;
        }
        const m = this.probeMatch(bucket.tries, method, path);
        if (m.kind === 'matched') {
          return { ...m, hostVars: hm.variables };
        }
      }
    }
    return this.probeMatch(this._agnostic, method, path);
  }

  /** Registered constraints for `(method, path)` — both inline + named. */
  constraintsFor(method: HttpMethod, path: string): readonly ParamConstraint[] {
    const { path: rewritten } = parseConstrainedPattern(path);
    return this._catalog.get(`${method} ${rewritten}`) ?? [];
  }

  get routeCount(): number {
    const count = (p: TriePair): number => p.constrained.routeCount + p.free.routeCount;
    return count(this._agnostic) + this._hosted.reduce((n, b) => n + count(b.tries), 0);
  }

  /** Registered host patterns, in match-priority order. */
  hostPatterns(): readonly string[] {
    return this._hosted.map((b) => b.pattern.raw);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private bucketFor(raw: string): HostedBucket {
    const existing = this._hosted.find((b) => b.pattern.raw === raw);
    if (existing !== undefined) {
      return existing;
    }
    const bucket: HostedBucket = {
      pattern: compileHostPattern(raw),
      tries: makeTriePair(),
    };
    this._hosted.push(bucket);
    this._hosted.sort((a, b) => b.pattern.specificity - a.pattern.specificity);
    return bucket;
  }

  /** Match in one trie, applying that trie's constraint index. */
  private matchWithConstraints(
    trie: RadixTrieRouter,
    idx: ConstraintIndex,
    method: HttpMethod,
    path: string
  ): MatchResult {
    const m = trie.match(method, path);
    if (m.kind !== 'matched') {
      return m;
    }
    const key = `${method} ${m.match.request.matchedPattern ?? m.match.route.path}`;
    const constraints = idx.get(key);
    if (constraints === undefined || constraints.length === 0) {
      return m;
    }
    for (const c of constraints) {
      const value = m.match.request.params[c.name];
      if (value === undefined || !c.regex.test(value)) {
        return { kind: 'not_found' };
      }
    }
    return m;
  }

  private probeMatch(tries: TriePair, method: HttpMethod, path: string): MatchResult {
    const c = this.matchWithConstraints(tries.constrained, tries.constrainedIdx, method, path);
    if (c.kind === 'matched') {
      return c;
    }
    return this.matchWithConstraints(tries.free, tries.freeIdx, method, path);
  }

  private async probePair(
    tries: TriePair,
    method: HttpMethod,
    path: string,
    headers: Record<string, string> | undefined,
    state: Record<string, unknown> | undefined
  ): Promise<(RouteResult & { matchedPattern?: string }) | null> {
    const m = this.probeMatch(tries, method, path);
    if (m.kind === 'matched') {
      const route = m.match.route;
      // Route registration tagged which trie it lives in — rewritten
      // paths collide, so the tag (not the path) selects the table.
      const tag = route.metadata?.[TRIE_TAG];
      const trie = tag === 'constrained' ? tries.constrained : tries.free;
      return trie.dispatch(method, path, headers, state);
    }
    if (m.kind === 'method_not_allowed') {
      const allowed = m.allowedMethods.join(', ');
      return {
        status: 405,
        body: { error: 'method_not_allowed', allowedMethods: allowed },
        headers: { allow: allowed },
        matchedPattern: m.closestPattern,
      };
    }
    return null;
  }
}

export { RouteConflictError };

/** Metadata key used to record which trie a rewritten route lives in. */
const TRIE_TAG = '__constrained_trie';
