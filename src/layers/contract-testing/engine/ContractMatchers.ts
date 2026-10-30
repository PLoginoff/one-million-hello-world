/**
 * ContractMatchers
 *
 * Pact-style matching engine for consumer-driven contract testing.
 *
 * Matching rules are attached to contract fields by JSON-path like
 * expressions (`$.body.items[*].id`, `$.headers.Content-Type`).
 * Supported rules:
 *
 *  - `type`            — same JSON type; for arrays also recursively applies
 *                        nested rules. Numbers match numbers, etc.
 *  - `regex`           — string must match the given regular expression.
 *  - `like`            — value must "look like" the template: same primitive
 *                        type; objects keep the same key set; array elements
 *                        each match the template element.
 *  - `eachLike`        — array where every element matches the template
 *                        object; optional `min` length constraint.
 *  - `arrayLength`     — array length must satisfy min / max / exact.
 *  - `equality`        — deep strict equality (the implicit default when no
 *                        matcher covers a path).
 *  - `integer`/`decimal`/`number`/`date`/`time`/`datetime`/`uuid`/`ipv4`
 *    /`email`/`boolean`/`nullValue` — primitive convenience matchers.
 *
 * Match evaluation is O(nodes in actual value). Structural diffing uses an
 * LCS-free path-walk that reports added / removed / changed / type-changed
 * leaves in a single traversal — O(n) in the larger of the two trees.
 *
 * @module ContractTesting/Engine
 */

/* ------------------------------------------------------------------------ */
/* Public types                                                             */
/* ------------------------------------------------------------------------ */

/** JSON-like value handled by the matcher. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** Supported matcher kinds. */
export type MatcherKind =
  | 'type'
  | 'regex'
  | 'like'
  | 'eachLike'
  | 'arrayLength'
  | 'equality'
  | 'integer'
  | 'decimal'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime'
  | 'uuid'
  | 'ipv4'
  | 'email'
  | 'boolean'
  | 'nullValue';

/**
 * A matching rule bound to a path. `path` uses dotted segments:
 * `$.body.items[*].id`. `[*]` applies the rule to every array element;
 * `[n]` targets a concrete index.
 */
export interface MatchingRule {
  readonly path: string;
  readonly matcher: MatcherKind;
  /** regex source (matcher === 'regex') */
  readonly pattern?: string;
  /** template value (matcher === 'like' | 'eachLike') */
  readonly template?: Json;
  /** minimum array length ('arrayLength' | 'eachLike') */
  readonly min?: number;
  /** maximum array length ('arrayLength') */
  readonly max?: number;
  /** exact array length ('arrayLength'); overrides min/max */
  readonly exact?: number;
}

/** A single mismatch discovered during verification. */
export interface MatchMismatch {
  /** Path in the actual value where the mismatch occurred. */
  readonly path: string;
  /** Expected description (rule or literal value). */
  readonly expected: string;
  /** Actual description (value or missing marker). */
  readonly actual: string;
  /** Human readable reason. */
  readonly reason: string;
}

/** Result of matching an actual payload against expected + rules. */
export interface MatchResult {
  readonly matched: boolean;
  readonly mismatches: readonly MatchMismatch[];
}

/** Kinds of structural diff entries. */
export type DiffKind = 'added' | 'removed' | 'changed' | 'typeChanged';

/** One entry in a structural diff between two JSON values. */
export interface DiffEntry {
  readonly path: string;
  readonly kind: DiffKind;
  readonly expected?: Json;
  readonly actual?: Json;
}

/** Parsed path segment: object key, array index, or wildcard. */
export type PathSegment =
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'wildcard' };

/* ------------------------------------------------------------------------ */
/* Path parsing                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Parse a dotted path expression into segments.
 *
 * Grammar:
 *   path      := '$' ( '.' segment )*
 *   segment   := ident ( '[' ( '*' | number ) ']' )*
 *   ident     := [A-Za-z_][A-Za-z0-9_-]*
 *
 * Bracketed keys with quoted strings are also accepted for keys that
 * contain dots: `$['weird.key'].value`.
 *
 * Complexity: O(length of expression).
 */
export function parsePath(expression: string): readonly PathSegment[] {
  const segments: PathSegment[] = [];
  let i = 0;
  const n = expression.length;

  const skipRoot = (): void => {
    if (expression[i] === '$') i++;
  };
  skipRoot();

  while (i < n) {
    const ch = expression[i];
    if (ch === '.') {
      i++;
      continue;
    }
    if (ch === '[') {
      // bracketed content: wildcard, number, or 'quoted key'
      i++;
      if (expression[i] === '*') {
        segments.push({ kind: 'wildcard' });
        i++;
      } else if (expression[i] === "'" || expression[i] === '"') {
        const quote = expression[i];
        i++;
        let key = '';
        while (i < n && expression[i] !== quote) {
          key += expression[i];
          i++;
        }
        i++; // closing quote
        segments.push({ kind: 'key', key });
      } else {
        let numStr = '';
        while (i < n && expression[i] !== ']') {
          numStr += expression[i];
          i++;
        }
        const idx = Number.parseInt(numStr, 10);
        segments.push(
          Number.isNaN(idx)
            ? { kind: 'key', key: numStr }
            : { kind: 'index', index: idx }
        );
      }
      // consume ']'
      while (i < n && expression[i] !== ']') i++;
      if (i < n) i++;
      continue;
    }
    // bare identifier
    let key = '';
    while (i < n && expression[i] !== '.' && expression[i] !== '[') {
      key += expression[i];
      i++;
    }
    if (key.length > 0) {
      segments.push({ kind: 'key', key });
    }
  }
  return segments;
}

/** Render a runtime path (mixed keys/indices) back to dotted form. */
export function renderPath(segments: readonly (string | number)[]): string {
  let out = '$';
  for (const s of segments) {
    if (typeof s === 'number') {
      out += `[${s}]`;
    } else if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(s)) {
      out += `.${s}`;
    } else {
      out += `['${s}']`;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* JSON helpers                                                             */
/* ------------------------------------------------------------------------ */

/** Type-guard narrowing `unknown` to the Json union. */
export function isJson(value: unknown): value is Json {
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return true;
    case 'object': {
      if (Array.isArray(value)) {
        return value.every((v) => isJson(v));
      }
      const rec = value as Record<string, unknown>;
      return Object.keys(rec).every((k) => isJson(rec[k]));
    }
    default:
      return false;
  }
}

/** Coerce an unknown payload to Json, or `undefined` when not JSON-like. */
export function asJson(value: unknown): Json | undefined {
  return isJson(value) ? value : undefined;
}

/** JSON type tag used by the `type` matcher. */
export function jsonTypeOf(value: Json): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function describe(value: Json | undefined): string {
  if (value === undefined) return '<missing>';
  const s = JSON.stringify(value);
  return s !== undefined && s.length <= 120 ? s : `${String(s).slice(0, 117)}...`;
}

/** Deep strict equality over the Json union. O(nodes). */
export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aRec = a as Record<string, Json>;
    const bRec = b as Record<string, Json>;
    const aKeys = Object.keys(aRec);
    const bKeys = Object.keys(bRec);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!(k in bRec)) return false;
      if (!deepEqual(aRec[k], bRec[k])) return false;
    }
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------------ */
/* Matcher registry                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Compiled matcher set. Rules are indexed by literal path; wildcard
 * segments participate in a trie-style walk during matching, so rule
 * lookup stays proportional to actual-value depth rather than rule count.
 */
export class MatcherSet {
  private readonly _root: RuleTrieNode = { children: new Map(), rules: [] };
  private readonly _rules: readonly MatchingRule[];

  constructor(rules: readonly MatchingRule[]) {
    this._rules = rules;
    for (const rule of rules) {
      this._insert(parsePath(rule.path), rule);
    }
  }

  get rules(): readonly MatchingRule[] {
    return this._rules;
  }

  private _insert(path: readonly PathSegment[], rule: MatchingRule): void {
    let node = this._root;
    for (const seg of path) {
      const key =
        seg.kind === 'key'
          ? `k:${seg.key}`
          : seg.kind === 'index'
            ? `i:${seg.index}`
            : 'w';
      let next = node.children.get(key);
      if (!next) {
        next = { children: new Map(), rules: [] };
        node.children.set(key, next);
      }
      node = next;
    }
    node.rules.push(rule);
  }

  /**
   * Collect every rule that applies to a runtime path.
   * Wildcard trie edges match both numeric and key segments; numeric
   * indices also match explicit `[n]` rule segments by position.
   */
  rulesFor(runtimePath: readonly (string | number)[]): readonly MatchingRule[] {
    const found: MatchingRule[] = [];
    const walk = (
      node: RuleTrieNode,
      depth: number
    ): void => {
      if (depth === runtimePath.length) {
        found.push(...node.rules);
        return;
      }
      const seg = runtimePath[depth];
      const candidates: string[] =
        typeof seg === 'number'
          ? ['i:*', 'w', `i:${seg}`, `k:${String(seg)}`]
          : [`k:${seg}`, 'w'];
      for (const c of candidates) {
        const child = node.children.get(c);
        if (child) walk(child, depth + 1);
      }
    };
    walk(this._root, 0);
    return found;
  }
}

interface RuleTrieNode {
  readonly children: Map<string, RuleTrieNode>;
  rules: MatchingRule[];
}

/* ------------------------------------------------------------------------ */
/* Rule evaluation                                                          */
/* ------------------------------------------------------------------------ */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const IPV4_RE =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Evaluate a single matcher against an actual value.
 * Returns `null` on success or a mismatch describing the failure.
 */
export function evaluateMatcher(
  rule: MatchingRule,
  actual: Json | undefined,
  path: readonly (string | number)[]
): MatchMismatch | null {
  const at = renderPath(path);
  const fail = (expected: string, reason: string): MatchMismatch => ({
    path: at,
    expected,
    actual: describe(actual),
    reason,
  });

  switch (rule.matcher) {
    case 'equality':
      return deepEqual(rule.template as Json, actual as Json)
        ? null
        : fail(describe(rule.template), 'values differ');
    case 'type': {
      if (actual === undefined) {
        return fail('present value', 'value is missing');
      }
      const t = rule.template;
      if (t !== undefined && jsonTypeOf(t) !== jsonTypeOf(actual)) {
        return fail(`type ${jsonTypeOf(t)}`, 'type mismatch');
      }
      return null;
    }
    case 'regex': {
      const pattern = rule.pattern ?? '';
      if (actual === undefined || typeof actual !== 'string') {
        return fail(`string matching /${pattern}/`, 'value is not a string');
      }
      return new RegExp(pattern).test(actual)
        ? null
        : fail(`/${pattern}/`, 'regex did not match');
    }
    case 'integer': {
      if (actual === undefined) return fail('integer', 'value is missing');
      return typeof actual === 'number' && Number.isInteger(actual)
        ? null
        : fail('integer', 'not an integer');
    }
    case 'decimal':
    case 'number': {
      if (actual === undefined) return fail('number', 'value is missing');
      return typeof actual === 'number' && Number.isFinite(actual)
        ? null
        : fail('number', 'not a finite number');
    }
    case 'boolean':
      return actual !== undefined && typeof actual === 'boolean'
        ? null
        : fail('boolean', 'not a boolean');
    case 'nullValue':
      return actual === null ? null : fail('null', 'value is not null');
    case 'uuid':
      return typeof actual === 'string' && UUID_RE.test(actual)
        ? null
        : fail('uuid', 'not a UUID');
    case 'ipv4':
      return typeof actual === 'string' && IPV4_RE.test(actual)
        ? null
        : fail('ipv4 address', 'not an IPv4 address');
    case 'email':
      return typeof actual === 'string' && EMAIL_RE.test(actual)
        ? null
        : fail('email address', 'not an email address');
    case 'date':
      return typeof actual === 'string' && DATE_RE.test(actual)
        ? null
        : fail('ISO date', 'not an ISO date');
    case 'time':
      return typeof actual === 'string' && TIME_RE.test(actual)
        ? null
        : fail('ISO time', 'not an ISO time');
    case 'datetime':
      return typeof actual === 'string' && DATETIME_RE.test(actual)
        ? null
        : fail('ISO datetime', 'not an ISO datetime');
    case 'arrayLength': {
      if (actual === undefined || !Array.isArray(actual)) {
        return fail('array', 'value is not an array');
      }
      const len = actual.length;
      if (rule.exact !== undefined && len !== rule.exact) {
        return fail(`array length ${rule.exact}`, `length is ${len}`);
      }
      if (rule.min !== undefined && len < rule.min) {
        return fail(`array length >= ${rule.min}`, `length is ${len}`);
      }
      if (rule.max !== undefined && len > rule.max) {
        return fail(`array length <= ${rule.max}`, `length is ${len}`);
      }
      return null;
    }
    case 'like': {
      if (actual === undefined) return fail('matching value', 'value is missing');
      const mismatch = matchLike(rule.template as Json, actual, path);
      return mismatch;
    }
    case 'eachLike': {
      if (actual === undefined || !Array.isArray(actual)) {
        return fail('array', 'value is not an array');
      }
      if (rule.min !== undefined && actual.length < rule.min) {
        return fail(`>= ${rule.min} elements`, `only ${actual.length} elements`);
      }
      for (let i = 0; i < actual.length; i++) {
        const m = matchLike(rule.template as Json, actual[i], [...path, i]);
        if (m) return m;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Structural "like" matching: template and actual must agree on shape —
 * objects keep the same key set, arrays match element-wise against the
 * first template element, primitives match by JSON type.
 */
function matchLike(
  template: Json | undefined,
  actual: Json,
  path: readonly (string | number)[]
): MatchMismatch | null {
  const at = renderPath(path);
  if (template === undefined) return null;
  const tt = jsonTypeOf(template);
  const at2 = jsonTypeOf(actual);
  if (tt !== at2) {
    return {
      path: at,
      expected: `like ${describe(template)}`,
      actual: describe(actual),
      reason: `type mismatch: expected ${tt}, got ${at2}`,
    };
  }
  if (tt === 'object') {
    const tRec = template as Record<string, Json>;
    const aRec = actual as Record<string, Json>;
    for (const k of Object.keys(tRec)) {
      if (!(k in aRec)) {
        return {
          path: `${at}.${k}`,
          expected: 'present',
          actual: '<missing>',
          reason: 'key missing from actual object',
        };
      }
      const m = matchLike(tRec[k], aRec[k], [...path, k]);
      if (m) return m;
    }
    return null;
  }
  if (tt === 'array') {
    const tArr = template as Json[];
    const aArr = actual as Json[];
    if (tArr.length === 0) return null;
    // Each actual element is matched against the template's first element,
    // which is how Pact treats `like` arrays (homogeneous collections).
    const tmpl = tArr[0];
    for (let i = 0; i < aArr.length; i++) {
      const m = matchLike(tmpl, aArr[i], [...path, i]);
      if (m) return m;
    }
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Top-level matching                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Match an actual JSON payload against an expected payload plus rules.
 *
 * Semantics follow Pact: a rule covering a node replaces strict equality
 * at that node and below (for `like`/`eachLike`/`type`), while uncovered
 * subtrees still require deep equality. Object keys present in the actual
 * value but not expected are tolerated only when a rule covers the
 * parent (matching "shape" mode); under strict equality they mismatch.
 *
 * Complexity: O(nodes in max(expected, actual)).
 */
export function matchValue(
  expected: Json | undefined,
  actual: Json | undefined,
  matchers: MatcherSet,
  basePath: readonly (string | number)[] = []
): MatchResult {
  const mismatches: MatchMismatch[] = [];
  const walk = (
    exp: Json | undefined,
    act: Json | undefined,
    path: (string | number)[]
  ): void => {
    const rules = matchers.rulesFor(path);
    if (rules.length > 0) {
      for (const rule of rules) {
        const m = evaluateMatcher(rule, act, path);
        if (m) mismatches.push(m);
      }
      return; // rules take over this subtree
    }
    if (exp === undefined && act === undefined) return;
    if (exp === undefined || act === undefined) {
      mismatches.push({
        path: renderPath(path),
        expected: describe(exp),
        actual: describe(act),
        reason:
          exp === undefined ? 'unexpected value present' : 'expected value missing',
      });
      return;
    }
    const et = jsonTypeOf(exp);
    const at = jsonTypeOf(act);
    if (et !== at) {
      mismatches.push({
        path: renderPath(path),
        expected: describe(exp),
        actual: describe(act),
        reason: `type mismatch: expected ${et}, got ${at}`,
      });
      return;
    }
    if (Array.isArray(exp) && Array.isArray(act)) {
      const len = Math.max(exp.length, act.length);
      for (let i = 0; i < len; i++) {
        walk(i < exp.length ? exp[i] : undefined, i < act.length ? act[i] : undefined, [
          ...path,
          i,
        ]);
      }
      return;
    }
    if (et === 'object') {
      const eRec = exp as Record<string, Json>;
      const aRec = act as Record<string, Json>;
      const keys = new Set([...Object.keys(eRec), ...Object.keys(aRec)]);
      for (const k of keys) {
        walk(k in eRec ? eRec[k] : undefined, k in aRec ? aRec[k] : undefined, [
          ...path,
          k,
        ]);
      }
      return;
    }
    if (!deepEqual(exp, act)) {
      mismatches.push({
        path: renderPath(path),
        expected: describe(exp),
        actual: describe(act),
        reason: 'values differ',
      });
    }
  };
  walk(expected, actual, [...basePath]);
  return { matched: mismatches.length === 0, mismatches };
}

/* ------------------------------------------------------------------------ */
/* Structural diff                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Compute a structural diff between two JSON values. Used both for
 * contract-vs-contract drift analysis and for rendering verification
 * failures as readable diffs.
 *
 * Reports leaf-level differences only: a changed primitive produces a
 * `changed` entry; a type change produces `typeChanged` without
 * descending; missing keys produce `added`/`removed` with the whole
 * subtree as the value.
 *
 * Complexity: O(n) in the number of nodes of the larger tree.
 */
export function structuralDiff(expected: Json, actual: Json): readonly DiffEntry[] {
  const entries: DiffEntry[] = [];
  const walk = (
    exp: Json | undefined,
    act: Json | undefined,
    path: (string | number)[]
  ): void => {
    const p = renderPath(path);
    if (exp === undefined) {
      entries.push({ path: p, kind: 'added', actual: act });
      return;
    }
    if (act === undefined) {
      entries.push({ path: p, kind: 'removed', expected: exp });
      return;
    }
    const et = jsonTypeOf(exp);
    const at = jsonTypeOf(act);
    if (et !== at) {
      entries.push({ path: p, kind: 'typeChanged', expected: exp, actual: act });
      return;
    }
    if (Array.isArray(exp) && Array.isArray(act)) {
      const len = Math.max(exp.length, act.length);
      for (let i = 0; i < len; i++) {
        walk(i < exp.length ? exp[i] : undefined, i < act.length ? act[i] : undefined, [
          ...path,
          i,
        ]);
      }
      return;
    }
    if (et === 'object') {
      const eRec = exp as Record<string, Json>;
      const aRec = act as Record<string, Json>;
      const keys = new Set([...Object.keys(eRec), ...Object.keys(aRec)]);
      for (const k of keys) {
        walk(k in eRec ? eRec[k] : undefined, k in aRec ? aRec[k] : undefined, [
          ...path,
          k,
        ]);
      }
      return;
    }
    if (!deepEqual(exp, act)) {
      entries.push({ path: p, kind: 'changed', expected: exp, actual: act });
    }
  };
  walk(expected, actual, []);
  return entries;
}

/**
 * Render a diff as unified-diff-style lines: ` ` context, `-` removed/
 * expected, `+` added/actual. Useful for verification reports.
 */
export function formatDiff(entries: readonly DiffEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    switch (e.kind) {
      case 'added':
        lines.push(`+ ${e.path} = ${describe(e.actual)}`);
        break;
      case 'removed':
        lines.push(`- ${e.path} = ${describe(e.expected)}`);
        break;
      case 'changed':
        lines.push(`- ${e.path} = ${describe(e.expected)}`);
        lines.push(`+ ${e.path} = ${describe(e.actual)}`);
        break;
      case 'typeChanged':
        lines.push(
          `! ${e.path} : ${jsonTypeOf(e.expected as Json)} -> ${jsonTypeOf(e.actual as Json)}`
        );
        break;
    }
  }
  return lines.join('\n');
}
