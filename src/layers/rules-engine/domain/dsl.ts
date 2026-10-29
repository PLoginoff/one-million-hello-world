/**
 * Condition DSL for the rules engine.
 *
 * A condition is a discriminated union of two node kinds:
 *  - {@link LeafCondition}: a predicate on a field path inside the fact object.
 *  - {@link LogicalCondition}: an AND/OR/NOT composition of child conditions.
 *
 * Evaluation is a pure recursive tree walk — O(nodes) per evaluation, no
 * caching. For hot paths, wrap the engine in a memoizing decorator; the AST
 * itself is immutable and freely shareable between threads of evaluation.
 *
 * @module RulesEngine/Domain
 */

/**
 * Operators supported by leaf conditions.
 *
 * | Operator       | Semantics                                              |
 * |----------------|--------------------------------------------------------|
 * | `==` / `!=`    | Structural equality (deep for objects)                 |
 * | `>` `>=` `<` `<=` | Numeric/Date/lexicographic ordering                |
 * | `in`           | `expected` array contains the fact value               |
 * | `notIn`        | Negated `in`                                           |
 * | `contains`     | Fact value (array or string) contains `expected`       |
 * | `startsWith` / `endsWith` | String prefix/suffix                        |
 * | `matches`      | RegExp match (expected is source or /flags/ literal)   |
 * | `exists` / `notExists` | Path resolution present/absent                 |
 * | `between`      | `expected` is `[low, high]` inclusive                  |
 */
export type ConditionOperator =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'exists'
  | 'notExists'
  | 'between';

/**
 * Primitive value usable on the right-hand side of a leaf condition.
 */
export type ConditionLiteral = string | number | boolean | null | ConditionLiteral[];

/**
 * Predicate on a single field path.
 *
 * @example
 * ```ts
 * { kind: 'leaf', field: 'user.age', op: '>=', value: 18 }
 * { kind: 'leaf', field: 'user.email', op: 'matches', value: '/@acme\\.com$/i' }
 * { kind: 'leaf', field: 'tags', op: 'contains', value: 'vip' }
 * ```
 */
export interface LeafCondition {
  readonly kind: 'leaf';
  /** Dot-separated path into the fact object (`a.b.c`). */
  readonly field: string;
  readonly op: ConditionOperator;
  /** Right-hand side. Ignored by exists/notExists. */
  readonly value?: ConditionLiteral | RegExp;
}

/**
 * Logical composition node.
 */
export interface LogicalCondition {
  readonly kind: 'and' | 'or' | 'not';
  /** For `not`, exactly one child is read (`children[0]`). */
  readonly children: readonly Condition[];
}

export type Condition = LeafCondition | LogicalCondition;

/**
 * Builder helpers so conditions read fluently instead of as nested literals.
 */
export const cond = {
  eq: (field: string, value: ConditionLiteral): LeafCondition => ({ kind: 'leaf', field, op: '==', value }),
  neq: (field: string, value: ConditionLiteral): LeafCondition => ({ kind: 'leaf', field, op: '!=', value }),
  gt: (field: string, value: number): LeafCondition => ({ kind: 'leaf', field, op: '>', value }),
  gte: (field: string, value: number): LeafCondition => ({ kind: 'leaf', field, op: '>=', value }),
  lt: (field: string, value: number): LeafCondition => ({ kind: 'leaf', field, op: '<', value }),
  lte: (field: string, value: number): LeafCondition => ({ kind: 'leaf', field, op: '<=', value }),
  isIn: (field: string, values: ConditionLiteral[]): LeafCondition => ({ kind: 'leaf', field, op: 'in', value: values }),
  notIn: (field: string, values: ConditionLiteral[]): LeafCondition => ({ kind: 'leaf', field, op: 'notIn', value: values }),
  contains: (field: string, value: ConditionLiteral): LeafCondition => ({ kind: 'leaf', field, op: 'contains', value }),
  startsWith: (field: string, value: string): LeafCondition => ({ kind: 'leaf', field, op: 'startsWith', value }),
  endsWith: (field: string, value: string): LeafCondition => ({ kind: 'leaf', field, op: 'endsWith', value }),
  matches: (field: string, value: string | RegExp): LeafCondition => ({ kind: 'leaf', field, op: 'matches', value: value as ConditionLiteral | RegExp }),
  exists: (field: string): LeafCondition => ({ kind: 'leaf', field, op: 'exists' }),
  notExists: (field: string): LeafCondition => ({ kind: 'leaf', field, op: 'notExists' }),
  between: (field: string, low: number, high: number): LeafCondition => ({ kind: 'leaf', field, op: 'between', value: [low, high] }),
  and: (...children: Condition[]): LogicalCondition => ({ kind: 'and', children }),
  or: (...children: Condition[]): LogicalCondition => ({ kind: 'or', children }),
  not: (child: Condition): LogicalCondition => ({ kind: 'not', children: [child] }),
  /** Unconditional match — useful for catch-all rules. */
  always: (): LogicalCondition => ({ kind: 'and', children: [] }),
  never: (): LogicalCondition => ({ kind: 'or', children: [] }),
};

/**
 * Resolves a dot-separated path against a plain object.
 *
 * Semantics:
 *  - Numeric segments index into arrays (`items.0.price`).
 *  - Any traversal through `null`/`undefined`/primitive yields `undefined`.
 *  - `undefined` is returned for missing keys — callers distinguish "absent"
 *    from "value is null" via the {@link PathResolution} wrapper.
 */
export interface PathResolution {
  readonly found: boolean;
  readonly value: unknown;
}

export function resolvePath(root: unknown, path: string): PathResolution {
  if (path === '') {
    return { found: true, value: root };
  }
  const segments = path.split('.');
  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return { found: false, value: undefined };
    }
    if (Array.isArray(cursor)) {
      const idx = Number(segment);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) {
        return { found: false, value: undefined };
      }
      cursor = cursor[idx];
      continue;
    }
    if (typeof cursor === 'object') {
      if (!(segment in (cursor as Record<string, unknown>))) {
        return { found: false, value: undefined };
      }
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return { found: false, value: undefined };
  }
  return { found: true, value: cursor };
}

/**
 * Structural (deep) equality used by `==`/`!=`/`in`.
 *
 * Handles primitives, arrays, plain objects, Dates and RegExps. Key order in
 * objects is ignored. Cyclic structures are compared structurally until a
 * repeated pair is seen, at which point they are considered equal (coinductive
 * equality — sufficient for rule facts, which should be acyclic anyway).
 */
export function deepEqual(a: unknown, b: unknown, seen: Set<string> = new Set()): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) {
    return false;
  }
  // Cycle guard: if we already compared this (id-ish) pair, treat as equal.
  const key = pairKey(a, b);
  if (key !== null) {
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  if (aArr && bArr) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) {
        return false;
      }
    }
    return true;
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const k of aKeys) {
    if (!(k in bObj)) {
      return false;
    }
    if (!deepEqual(aObj[k], bObj[k], seen)) {
      return false;
    }
  }
  return true;
}

// Object ids for the deepEqual cycle guard — assigned lazily.
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function pairKey(a: object, b: object): string | null {
  let aId = objectIds.get(a);
  if (aId === undefined) {
    aId = nextObjectId++;
    objectIds.set(a, aId);
  }
  let bId = objectIds.get(b);
  if (bId === undefined) {
    bId = nextObjectId++;
    objectIds.set(b, bId);
  }
  return `${aId}:${bId}`;
}

/**
 * Parses a regex literal written as `/source/flags` or a bare source string.
 */
export function parseRegex(input: string | RegExp): RegExp {
  if (input instanceof RegExp) {
    return input;
  }
  const literal = /^\/(.*)\/([dgimsuvy]*)$/.exec(input);
  if (literal) {
    return new RegExp(literal[1], literal[2]);
  }
  return new RegExp(input);
}

function compareOrder(actual: unknown, expected: unknown): number | null {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual - expected;
  }
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() - expected.getTime();
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual < expected ? -1 : actual > expected ? 1 : 0;
  }
  // Allow comparing a Date field against an ISO string or epoch literal.
  if (actual instanceof Date && typeof expected === 'string') {
    const t = Date.parse(expected);
    return Number.isNaN(t) ? null : actual.getTime() - t;
  }
  if (actual instanceof Date && typeof expected === 'number') {
    return actual.getTime() - expected;
  }
  return null;
}

function evaluateLeaf(leaf: LeafCondition, facts: Record<string, unknown>): boolean {
  const { found, value: actual } = resolvePath(facts, leaf.field);

  switch (leaf.op) {
    case 'exists':
      return found;
    case 'notExists':
      return !found;
    default:
      break;
  }

  // All remaining operators require the path to resolve to something.
  if (!found) {
    return false;
  }

  const expected = leaf.value;

  switch (leaf.op) {
    case '==':
      return deepEqual(actual, expected);
    case '!=':
      return !deepEqual(actual, expected);
    case '>': {
      const c = compareOrder(actual, expected);
      return c !== null && c > 0;
    }
    case '>=': {
      const c = compareOrder(actual, expected);
      return c !== null && c >= 0;
    }
    case '<': {
      const c = compareOrder(actual, expected);
      return c !== null && c < 0;
    }
    case '<=': {
      const c = compareOrder(actual, expected);
      return c !== null && c <= 0;
    }
    case 'in': {
      if (!Array.isArray(expected)) {
        return false;
      }
      return expected.some((e) => deepEqual(actual, e));
    }
    case 'notIn': {
      if (!Array.isArray(expected)) {
        return true;
      }
      return !expected.some((e) => deepEqual(actual, e));
    }
    case 'contains': {
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.some((e) => deepEqual(e, expected));
      }
      return false;
    }
    case 'startsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'endsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'matches': {
      if (typeof actual !== 'string' || expected === undefined) {
        return false;
      }
      const re = parseRegex(expected as string | RegExp);
      return re.test(actual);
    }
    case 'between': {
      if (!Array.isArray(expected) || expected.length !== 2) {
        return false;
      }
      const low = compareOrder(actual, expected[0]);
      const high = compareOrder(actual, expected[1]);
      return low !== null && high !== null && low >= 0 && high <= 0;
    }
    default:
      return false;
  }
}

/**
 * Evaluates a condition tree against a fact object.
 *
 * - `and` with zero children is `true` (empty conjunction).
 * - `or` with zero children is `false` (empty disjunction).
 * - `not` reads `children[0]`; an empty `not` evaluates to `false`.
 *
 * Short-circuits inside AND/OR.
 */
export function evaluateCondition(condition: Condition, facts: Record<string, unknown>): boolean {
  switch (condition.kind) {
    case 'leaf':
      return evaluateLeaf(condition, facts);
    case 'and':
      for (const child of condition.children) {
        if (!evaluateCondition(child, facts)) {
          return false;
        }
      }
      return true;
    case 'or':
      for (const child of condition.children) {
        if (evaluateCondition(child, facts)) {
          return true;
        }
      }
      return false;
    case 'not': {
      const child = condition.children[0];
      if (child === undefined) {
        return false;
      }
      return !evaluateCondition(child, facts);
    }
  }
}

/**
 * Counts leaf nodes in a condition tree. Used for *specificity* in conflict
 * resolution: more constrained rules win over broader ones.
 */
export function conditionSpecificity(condition: Condition): number {
  if (condition.kind === 'leaf') {
    return 1;
  }
  let total = 0;
  for (const child of condition.children) {
    total += conditionSpecificity(child);
  }
  return total;
}

/**
 * Collects the set of field paths referenced by a condition. The forward
 * chainer uses this to build a field → rule index so only rules depending on
 * a mutated field are re-evaluated.
 */
export function conditionFields(condition: Condition, out: Set<string> = new Set()): Set<string> {
  if (condition.kind === 'leaf') {
    out.add(condition.field);
    return out;
  }
  for (const child of condition.children) {
    conditionFields(child, out);
  }
  return out;
}
