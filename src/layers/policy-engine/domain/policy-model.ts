/**
 * Policy-as-code domain model (XACML-inspired, attribute-based).
 *
 * Model summary:
 *  - A {@link PolicyRequest} carries four attribute categories: `subject`,
 *    `resource`, `action`, `environment`. Each is a plain attribute bag.
 *  - {@link Expression} trees evaluate against a request. `attr` nodes
 *    resolve (category, path) pairs; `apply` nodes call named functions
 *    (`eq`, `gt`, `anyOf`, `matches`, …) over child expressions.
 *  - {@link Target}s gate applicability — a cheap conjunction of attribute
 *    matches evaluated before the expensive condition tree.
 *  - {@link PolicyRule} = target + condition + effect + obligations/advice.
 *  - {@link Policy} = rule list + rule-combining algorithm.
 *  - {@link PolicySet} = policy/policy-set list + target + policy-combining
 *    algorithm (nesting allowed).
 *  - {@link Decision} = permit | deny | notApplicable | indeterminate plus
 *    obligations (must-dos on permit/deny) and advice (informational).
 *
 * @module PolicyEngine/Domain
 */

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export type AttributeCategory = 'subject' | 'resource' | 'action' | 'environment';

export interface PolicyRequest {
  readonly subject: Record<string, unknown>;
  readonly resource: Record<string, unknown>;
  /** Action may be a bare string (`"read"`) or an attribute bag. */
  readonly action: string | Record<string, unknown>;
  readonly environment?: Record<string, unknown>;
}

/** Normalized request view — action always a record with `id` populated. */
export interface NormalizedRequest {
  readonly subject: Record<string, unknown>;
  readonly resource: Record<string, unknown>;
  readonly action: Record<string, unknown>;
  readonly environment: Record<string, unknown>;
}

export function normalizeRequest(req: PolicyRequest): NormalizedRequest {
  return {
    subject: req.subject,
    resource: req.resource,
    action: typeof req.action === 'string' ? { id: req.action } : req.action,
    environment: req.environment ?? {},
  };
}

/* ------------------------------------------------------------------ */
/* Expressions                                                         */
/* ------------------------------------------------------------------ */

export type Expression =
  | { readonly kind: 'literal'; readonly value: unknown }
  | { readonly kind: 'attr'; readonly category: AttributeCategory; readonly path: string }
  | { readonly kind: 'apply'; readonly fn: ApplyFunction; readonly args: readonly Expression[] };

/**
 * Functions usable inside `apply` nodes.
 *
 * - Comparison: `eq neq gt gte lt lte` — exactly 2 args.
 * - Boolean: `and or` — n-ary (0-ary and=true, or=false); `not` — unary.
 * - Membership: `in` — (value, listExpr); `contains` — (listOrString, value).
 * - Set helpers: `anyOf` — (value, list) true if value matches ANY element
 *   (deep equality); `allOf` — (list, values) true if EVERY element of the
 *   second list is contained in the first.
 * - Strings: `matches` (regex), `startsWith`, `endsWith`.
 * - Presence: `exists` — unary, true when the attr resolved (not undefined).
 * - `isNull` — unary.
 */
export type ApplyFunction =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'and'
  | 'or'
  | 'not'
  | 'in'
  | 'contains'
  | 'anyOf'
  | 'allOf'
  | 'matches'
  | 'startsWith'
  | 'endsWith'
  | 'exists'
  | 'isNull';

/** Fluent expression builder. */
export const x = {
  lit: (value: unknown): Expression => ({ kind: 'literal', value }),
  subject: (path: string): Expression => ({ kind: 'attr', category: 'subject', path }),
  resource: (path: string): Expression => ({ kind: 'attr', category: 'resource', path }),
  action: (path = 'id'): Expression => ({ kind: 'attr', category: 'action', path }),
  env: (path: string): Expression => ({ kind: 'attr', category: 'environment', path }),
  apply: (fn: ApplyFunction, ...args: Expression[]): Expression => ({ kind: 'apply', fn, args }),
  eq: (a: Expression, b: Expression): Expression => x.apply('eq', a, b),
  gt: (a: Expression, b: Expression): Expression => x.apply('gt', a, b),
  gte: (a: Expression, b: Expression): Expression => x.apply('gte', a, b),
  lt: (a: Expression, b: Expression): Expression => x.apply('lt', a, b),
  lte: (a: Expression, b: Expression): Expression => x.apply('lte', a, b),
  and: (...args: Expression[]): Expression => x.apply('and', ...args),
  or: (...args: Expression[]): Expression => x.apply('or', ...args),
  not: (a: Expression): Expression => x.apply('not', a),
  anyOf: (value: Expression, list: Expression): Expression => x.apply('anyOf', value, list),
  allOf: (list: Expression, values: Expression): Expression => x.apply('allOf', list, values),
  in: (value: Expression, list: Expression): Expression => x.apply('in', value, list),
  contains: (list: Expression, value: Expression): Expression => x.apply('contains', list, value),
  matches: (a: Expression, pattern: Expression): Expression => x.apply('matches', a, pattern),
  exists: (a: Expression): Expression => x.apply('exists', a),
};

/** Sentinel for "attribute did not resolve" — distinct from present-null. */
const MISSING = Symbol('policy-attr-missing');
export type EvalResult = unknown | typeof MISSING;
export const isMissing = (v: EvalResult): v is typeof MISSING => v === MISSING;

function resolveAttr(req: NormalizedRequest, category: AttributeCategory, path: string): EvalResult {
  let cursor: unknown = req[category];
  for (const seg of path.split('.')) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return MISSING;
    }
    if (!(seg in (cursor as Record<string, unknown>))) {
      return MISSING;
    }
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

function deepEq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) {
    return false;
  }
  if (aArr && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEq(v, b[i]));
  }
  const aKeys = Object.keys(a as object);
  const bObj = b as Record<string, unknown>;
  if (aKeys.length !== Object.keys(bObj).length) {
    return false;
  }
  return aKeys.every((k) => k in bObj && deepEq((a as Record<string, unknown>)[k], bObj[k]));
}

function truthy(v: EvalResult): boolean {
  return v !== MISSING && Boolean(v);
}

function toRegex(v: unknown): RegExp | null {
  if (v instanceof RegExp) {
    return v;
  }
  if (typeof v !== 'string') {
    return null;
  }
  const m = /^\/(.*)\/([dgimsuvy]*)$/.exec(v);
  try {
    return m ? new RegExp(m[1], m[2]) : new RegExp(v);
  } catch {
    return null;
  }
}

/**
 * Three-valued expression evaluation.
 *
 * XACML distinguishes `true | false | indeterminate`. Indeterminate arises
 * when a required attribute is missing or a function is applied to
 * ill-typed operands — it propagates up and can flip a policy decision to
 * `indeterminate`, which combining algorithms treat explicitly.
 */
export type TriState = 'true' | 'false' | 'indeterminate';

export function evaluateExpression(expr: Expression, req: NormalizedRequest): TriState {
  const v = evalValue(expr, req);
  if (isMissing(v)) {
    return 'indeterminate';
  }
  return v ? 'true' : 'false';
}

/**
 * Raw value evaluation — used internally and by obligations that embed
 * attribute references (e.g. "deny because {resource.classification}").
 */
export function evalValue(expr: Expression, req: NormalizedRequest): EvalResult {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'attr':
      return resolveAttr(req, expr.category, expr.path);
    case 'apply':
      return applyFn(expr.fn, expr.args, req);
  }
}

function applyFn(fn: ApplyFunction, args: readonly Expression[], req: NormalizedRequest): EvalResult {
  switch (fn) {
    case 'and': {
      let missing = false;
      for (const a of args) {
        const v = evalValue(a, req);
        if (isMissing(v)) {
          missing = true;
        } else if (!v) {
          return false;
        }
      }
      return missing ? MISSING : true;
    }
    case 'or': {
      let missing = false;
      for (const a of args) {
        const v = evalValue(a, req);
        if (isMissing(v)) {
          missing = true;
        } else if (v) {
          return true;
        }
      }
      return missing ? MISSING : false;
    }
    case 'not': {
      const v = args.length === 1 ? evalValue(args[0], req) : MISSING;
      return isMissing(v) ? MISSING : !v;
    }
    case 'exists': {
      if (args.length !== 1) {
        return MISSING;
      }
      return !isMissing(evalValue(args[0], req));
    }
    case 'isNull': {
      if (args.length !== 1) {
        return MISSING;
      }
      const v = evalValue(args[0], req);
      return isMissing(v) ? MISSING : v === null;
    }
    default:
      break;
  }

  if (args.length !== 2) {
    return MISSING;
  }
  const a = evalValue(args[0], req);
  const b = evalValue(args[1], req);

  // `eq`/`neq` treat missing as a concrete outcome; everything else is
  // indeterminate when an operand is missing.
  if (fn === 'eq') {
    return isMissing(a) || isMissing(b) ? false : deepEq(a, b);
  }
  if (fn === 'neq') {
    return isMissing(a) || isMissing(b) ? true : !deepEq(a, b);
  }
  if (isMissing(a) || isMissing(b)) {
    return MISSING;
  }

  switch (fn) {
    case 'gt':
      return cmp(a, b, (c) => c > 0);
    case 'gte':
      return cmp(a, b, (c) => c >= 0);
    case 'lt':
      return cmp(a, b, (c) => c < 0);
    case 'lte':
      return cmp(a, b, (c) => c <= 0);
    case 'in':
      return Array.isArray(b) && b.some((e) => deepEq(a, e));
    case 'contains':
      if (typeof a === 'string' && typeof b === 'string') {
        return a.includes(b);
      }
      return Array.isArray(a) && a.some((e) => deepEq(e, b));
    case 'anyOf':
      return Array.isArray(b) && b.some((e) => deepEq(a, e));
    case 'allOf':
      return Array.isArray(a) && Array.isArray(b) && b.every((e) => a.some((m) => deepEq(m, e)));
    case 'matches': {
      if (typeof a !== 'string') {
        return MISSING;
      }
      const re = toRegex(b);
      return re === null ? MISSING : re.test(a);
    }
    case 'startsWith':
      return typeof a === 'string' && typeof b === 'string' && a.startsWith(b);
    case 'endsWith':
      return typeof a === 'string' && typeof b === 'string' && a.endsWith(b);
    default:
      return MISSING;
  }
}

function cmp(a: unknown, b: unknown, pred: (c: number) => boolean): EvalResult {
  let c: number | null = null;
  if (typeof a === 'number' && typeof b === 'number') {
    c = a - b;
  } else if (typeof a === 'string' && typeof b === 'string') {
    c = a < b ? -1 : a > b ? 1 : 0;
  } else if (a instanceof Date && (b instanceof Date || typeof b === 'string' || typeof b === 'number')) {
    const bt = b instanceof Date ? b.getTime() : typeof b === 'string' ? Date.parse(b) : b;
    c = Number.isNaN(bt) ? null : a.getTime() - bt;
  }
  return c === null ? MISSING : pred(c);
}

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

/**
 * One attribute assertion inside a target. All matches in a target are
 * AND-ed — targets are deliberately simple so they can be precompiled and
 * indexed.
 */
export interface TargetMatch {
  readonly category: AttributeCategory;
  readonly path: string;
  readonly op: 'eq' | 'neq' | 'in' | 'matches' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists';
  readonly value?: unknown;
}

export interface Target {
  readonly anyOf?: readonly TargetMatch[][]; // disjunction of conjunction groups
  readonly allOf?: readonly TargetMatch[]; // simple conjunction (common case)
}

/** Empty target — matches every request. */
export const ANY_TARGET: Target = {};

export function targetMatches(target: Target, req: NormalizedRequest): boolean {
  if (target.allOf && !target.allOf.every((m) => singleMatch(m, req))) {
    return false;
  }
  if (target.anyOf && target.anyOf.length > 0) {
    return target.anyOf.some((group) => group.every((m) => singleMatch(m, req)));
  }
  return true;
}

function singleMatch(m: TargetMatch, req: NormalizedRequest): boolean {
  const v = resolveAttr(req, m.category, m.path);
  if (m.op === 'exists') {
    return !isMissing(v);
  }
  if (isMissing(v)) {
    return m.op === 'neq';
  }
  switch (m.op) {
    case 'eq':
      return deepEq(v, m.value);
    case 'neq':
      return !deepEq(v, m.value);
    case 'in':
      return Array.isArray(m.value) && m.value.some((e) => deepEq(v, e));
    case 'matches': {
      const re = toRegex(m.value);
      return typeof v === 'string' && re !== null && re.test(v);
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const pred = { gt: (c: number) => c > 0, gte: (c: number) => c >= 0, lt: (c: number) => c < 0, lte: (c: number) => c <= 0 }[m.op];
      const r = cmp(v, m.value, pred);
      return r === true;
    }
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Rules, policies, sets                                               */
/* ------------------------------------------------------------------ */

export type Effect = 'permit' | 'deny';
export type DecisionEffect = Effect | 'notApplicable' | 'indeterminate';

/** Something the PEP must do when enforcing the decision. */
export interface Obligation {
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}

/** Informational guidance — PEP may ignore. */
export interface Advice {
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}

export interface PolicyRule {
  readonly id: string;
  readonly effect: Effect;
  readonly target?: Target;
  readonly condition?: Expression;
  /** Attached when this rule produces the final effect. */
  readonly obligations?: readonly Obligation[];
  readonly advice?: readonly Advice[];
  readonly enabled?: boolean;
}

export type CombiningAlgorithm =
  | 'deny-overrides'
  | 'permit-overrides'
  | 'first-applicable'
  | 'only-one-applicable'
  | 'majority'
  | 'ordered-deny-overrides'
  | 'ordered-permit-overrides';

export interface Policy {
  readonly id: string;
  readonly version?: string;
  readonly target?: Target;
  readonly rules: readonly PolicyRule[];
  readonly ruleCombining: CombiningAlgorithm;
  readonly obligations?: readonly Obligation[];
  readonly advice?: readonly Advice[];
  readonly enabled?: boolean;
}

export interface PolicySet {
  readonly id: string;
  readonly version?: string;
  readonly target?: Target;
  readonly policies: readonly (Policy | PolicySet)[];
  readonly policyCombining: CombiningAlgorithm;
  readonly obligations?: readonly Obligation[];
  readonly advice?: readonly Advice[];
}

export function isPolicySet(p: Policy | PolicySet): p is PolicySet {
  return 'policies' in p;
}

/* ------------------------------------------------------------------ */
/* Decision                                                            */
/* ------------------------------------------------------------------ */

export interface Decision {
  readonly effect: DecisionEffect;
  /** Obligations bound to the final effect. */
  readonly obligations: readonly Obligation[];
  readonly advice: readonly Advice[];
  /** Ids that produced the decision — for auditing. */
  readonly decidingPolicyIds: readonly string[];
  readonly decidingRuleIds: readonly string[];
  readonly reason?: string;
}

export const NOT_APPLICABLE: Decision = {
  effect: 'notApplicable',
  obligations: [],
  advice: [],
  decidingPolicyIds: [],
  decidingRuleIds: [],
};

export const INDETERMINATE: Decision = {
  effect: 'indeterminate',
  obligations: [],
  advice: [],
  decidingPolicyIds: [],
  decidingRuleIds: [],
  reason: 'evaluation produced an indeterminate result',
};

/**
 * Per-element evaluation output — a {@link Decision} plus the entity it came
 * from so combining algorithms can attach the right obligations.
 */
export interface ElementResult {
  readonly decision: Decision;
  readonly obligations: readonly Obligation[];
  readonly advice: readonly Advice[];
}
