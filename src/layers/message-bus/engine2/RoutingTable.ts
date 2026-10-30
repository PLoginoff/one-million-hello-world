/**
 * Content-Based Routing Table
 *
 * An ordered matcher over `RoutingRule` rows: a message matches a rule
 * when its routing key satisfies the topic pattern AND every header
 * predicate holds. Rules are evaluated in ascending `priority`, ties
 * broken by insertion order — first match wins, mirroring classifier
 * tables in software routers (Cisco PBR, Envoy route tables).
 *
 * Matching cost:
 *   - Topic patterns compile once to regexes at `addRule` — O(pattern).
 *   - `route()` scans at most R rules; each rule costs one regex test
 *     plus |predicates| header lookups → O(R · P) worst case. For hot
 *     paths `routeAll()` shares the same per-rule work.
 *
 * Glob syntax for `match` predicates: `*` = any run of non-dot chars,
 * `?` = exactly one char. Topic syntax for keys: `.`-separated words,
 * `*` = exactly one word, `#` = zero or more words (AMQP 0-9-1).
 *
 * @module MessageBusLayer/Engine2
 */

import {
  HeaderPredicate,
  RouteDecision,
  RoutedMessage,
  RoutingRule,
} from './types';

/** Escape regex metacharacters in a literal fragment. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile an AMQP topic pattern to a regex.
 * `orders.*.created` → ^orders\.[^.]+\.created$
 * `orders.#`         → ^orders(?:\.[^.]+)*$   (hash also matches bare `orders`)
 */
export function compileTopicPattern(pattern: string): RegExp {
  if (pattern === '#') return /^.*$/;
  const words = pattern.split('.');
  // Build alternation-free regex; `#` becomes an optional run of words.
  // Leading `#` must allow matching with or without the leading dot.
  const segs: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === '') {
      throw new Error(`invalid topic pattern: empty word in '${pattern}'`);
    }
    const sep = i === 0 ? '' : '\\.';
    if (w === '#') {
      // Zero or more whole words; when leading, match optional words
      // with optional separator so `a.b` and `a` both match `#.x`-style tails.
      segs.push(i === 0 ? '(?:[^.]+\\.)*' : `(?:\\.[^.]+)*`);
      continue;
    }
    if (w === '*') {
      segs.push(`${sep}[^.]+`);
    } else {
      segs.push(`${sep}${escapeRegExp(w)}`);
    }
  }
  return new RegExp(`^${segs.join('')}$`);
}

/** Compile a `*`/`?` glob into an anchored regex (literal otherwise). */
function compileGlob(pattern: string): RegExp {
  const out: string[] = ['^'];
  for (const ch of pattern) {
    if (ch === '*') out.push('.*');
    else if (ch === '?') out.push('.');
    else out.push(escapeRegExp(ch));
  }
  out.push('$');
  return new RegExp(out.join(''));
}

/** A predicate with any patterns pre-compiled. */
interface CompiledPredicate {
  readonly spec: HeaderPredicate;
  /** Present for `match` predicates and `in` sets. */
  readonly regex?: RegExp;
  readonly valueSet?: ReadonlySet<string>;
}

function compilePredicate(p: HeaderPredicate): CompiledPredicate {
  switch (p.kind) {
    case 'match':
      return { spec: p, regex: compileGlob(p.pattern) };
    case 'in':
      return { spec: p, valueSet: new Set(p.values) };
    default:
      return { spec: p };
  }
}

function evalPredicate(p: CompiledPredicate, headers: Readonly<Record<string, string>>): boolean {
  const spec = p.spec;
  const value = headers[spec.header];
  switch (spec.kind) {
    case 'exists':
      return value !== undefined;
    case 'equals':
      return value === spec.value;
    case 'match':
      return value !== undefined && p.regex !== undefined && p.regex.test(value);
    case 'in':
      return value !== undefined && p.valueSet !== undefined && p.valueSet.has(value);
  }
}

interface CompiledRule {
  readonly rule: RoutingRule;
  readonly keyRegex: RegExp;
  readonly predicates: readonly CompiledPredicate[];
  /** Monotonic sequence number for stable priority ties. */
  readonly seq: number;
}

export class RouteTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteTableError';
  }
}

/**
 * Ordered routing table with compiled matchers.
 *
 * Rules may share a key pattern; the priority field provides the
 * "longest-prefix-first" analogue — administrators order overlapping
 * rows explicitly rather than relying on pattern specificity.
 */
export class RoutingTable {
  private readonly _rules: CompiledRule[] = [];
  private readonly _byId = new Map<string, CompiledRule>();
  private _seq = 0;

  /** Register a rule. Re-sorts on insert; duplicates by `id` throw. */
  addRule(rule: RoutingRule): void {
    if (this._byId.has(rule.id)) {
      throw new RouteTableError(`duplicate routing rule '${rule.id}'`);
    }
    const compiled: CompiledRule = {
      rule,
      keyRegex: compileTopicPattern(rule.keyPattern),
      predicates: rule.predicates.map(compilePredicate),
      seq: this._seq++,
    };
    this._byId.set(rule.id, compiled);
    // Insertion into a nearly-sorted array is O(R) — rules change rarely.
    const idx = this._rules.findIndex(
      (r) => r.rule.priority > rule.priority ||
        (r.rule.priority === rule.priority && r.seq > compiled.seq)
    );
    if (idx === -1) this._rules.push(compiled);
    else this._rules.splice(idx, 0, compiled);
  }

  removeRule(id: string): boolean {
    const c = this._byId.get(id);
    if (!c) return false;
    this._byId.delete(id);
    const i = this._rules.indexOf(c);
    if (i >= 0) this._rules.splice(i, 1);
    return true;
  }

  get ruleCount(): number {
    return this._rules.length;
  }

  /** First matching rule wins; null when nothing matches (dead route). */
  route(message: RoutedMessage): RouteDecision | null {
    for (const r of this._rules) {
      if (!r.keyRegex.test(message.routingKey)) continue;
      let ok = true;
      for (const p of r.predicates) {
        if (!evalPredicate(p, message.headers)) {
          ok = false;
          break;
        }
      }
      if (ok) return { ruleId: r.rule.id, queue: r.rule.queue };
    }
    return null;
  }

  /**
   * All matching destinations, in priority order. Used by fan-out
   * delivery and for dry-run route audits.
   */
  routeAll(message: RoutedMessage): RouteDecision[] {
    const out: RouteDecision[] = [];
    for (const r of this._rules) {
      if (!r.keyRegex.test(message.routingKey)) continue;
      let ok = true;
      for (const p of r.predicates) {
        if (!evalPredicate(p, message.headers)) {
          ok = false;
          break;
        }
      }
      if (ok) out.push({ ruleId: r.rule.id, queue: r.rule.queue });
    }
    return out;
  }

  /** List registered rules in evaluation order (diagnostics). */
  describe(): readonly RoutingRule[] {
    return this._rules.map((r) => r.rule);
  }
}
