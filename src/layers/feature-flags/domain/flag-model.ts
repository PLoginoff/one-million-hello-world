/**
 * Feature flag domain model.
 *
 * Flag types: `boolean` (on/off), `multivariate` (named variants with
 * weights), `json` (arbitrary payload). Evaluation pipeline per request:
 *
 *  1. Context resolution — evaluate() merges contexts by inheritance
 *     (`parent` chains) so a request context can extend a user/org context.
 *  2. Kill switch — `killed: true` flags always return `offValue` /
 *     default variant regardless of targeting.
 *  3. Dependencies — `requires: [{ flag, equals? }]` — all must hold
 *     (evaluated recursively, cycle-guarded) before targeting runs.
 *  4. Targeting rules — ordered; first matching rule wins and may specify
 *     a fixed variant or a percentage rollout.
 *  5. Percentage rollout — consistent hash bucketing assigns the user to
 *     a sticky bucket 0-99; weights split the bucket space into variants.
 *     The same (flagKey, userKey, salt) always lands in the same bucket.
 *
 * @module FeatureFlags/Domain
 */

/** Opaque user/session key used for bucketing (e.g. user id, session id). */
export type BucketKey = string;

/**
 * Evaluation context — attribute bag with optional parent inheritance.
 * `key` is the bucketing identity; `kind` namespaces buckets per entity
 * type (user/org/session) so the same id in different kinds hashes
 * differently — mirroring LaunchDarkly's context kinds.
 */
export interface EvalContext {
  readonly kind?: string;
  readonly key?: BucketKey;
  readonly attributes?: Record<string, unknown>;
  /** Parent context — attributes merged child-over-parent at evaluation. */
  readonly parent?: EvalContext;
}

/** Flattens a context chain: child attributes shadow parent attributes. */
export function flattenContext(ctx: EvalContext | undefined): {
  kind: string;
  key: BucketKey | undefined;
  attributes: Record<string, unknown>;
} {
  const chain: EvalContext[] = [];
  let cur = ctx;
  while (cur) {
    chain.push(cur);
    cur = cur.parent;
  }
  const merged: Record<string, unknown> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    Object.assign(merged, chain[i].attributes ?? {});
  }
  const head = chain[0];
  return {
    kind: head?.kind ?? 'user',
    key: head?.key,
    attributes: merged,
  };
}

/* ------------------------------------------------------------------ */
/* Targeting                                                           */
/* ------------------------------------------------------------------ */

export type TargetOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists'
  | 'semverGt'
  | 'semverGte'
  | 'semverLt'
  | 'semverLte';

/** A single attribute predicate. */
export interface TargetClause {
  readonly attribute: string;
  readonly op: TargetOperator;
  readonly value?: unknown;
}

/** Segment — a reusable named group of clauses (AND within a rule). */
export interface Segment {
  readonly id: string;
  readonly name?: string;
  readonly clauses: readonly TargetClause[];
}

/**
 * A targeting rule: all `clauses` AND together; `segments` must all match.
 * `rollout` distributes matched users across variants by weighted buckets;
 * `variant` fixes a single result. Exactly one of `variant`/`rollout`
 * (rollout takes precedence when both are set).
 */
export interface TargetRule {
  readonly clauses?: readonly TargetClause[];
  /** Segment ids — resolved against the flag store's segment table. */
  readonly segments?: readonly string[];
  readonly variant?: string;
  readonly rollout?: Rollout;
}

/** Weighted variant split over the 0-99 bucket space. */
export interface Rollout {
  readonly weights: readonly { variant: string; weight: number }[];
  /**
   * Salt for bucket hashing — different salts decorrelate rollouts so a
   * user in flag A's 10% isn't automatically in flag B's 10%.
   */
  readonly salt?: string;
}

/* ------------------------------------------------------------------ */
/* Flags                                                               */
/* ------------------------------------------------------------------ */

export interface FlagVariant {
  readonly id: string;
  readonly value: unknown;
}

export type FlagType = 'boolean' | 'multivariate' | 'json';

export interface FeatureFlag {
  readonly key: string;
  readonly type: FlagType;
  readonly enabled: boolean;
  /** Boolean: 'on'/'off'. Multivariate/json: variant ids. */
  readonly variants?: readonly FlagVariant[];
  /** Value when flag is enabled and no rule matched (or flag has no rules). */
  readonly defaultVariant?: string;
  /** Value when flag is disabled / killed / dependency unmet. */
  readonly offVariant?: string;
  readonly rules?: readonly TargetRule[];
  /** Dependencies — all must hold before this flag evaluates. */
  readonly requires?: readonly FlagDependency[];
  /** Emergency kill switch — overrides everything. */
  readonly killed?: boolean;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly version?: number;
}

export interface FlagDependency {
  readonly flag: string;
  /** Required evaluation result; `true` if omitted (flag must be 'on'). */
  readonly equals?: unknown;
}

/* ------------------------------------------------------------------ */
/* Evaluation result                                                   */
/* ------------------------------------------------------------------ */

export type EvalReason =
  | 'killed'
  | 'disabled'
  | 'dependency-unmet'
  | 'rule-match'
  | 'segment-match'
  | 'fallthrough'
  | 'default'
  | 'error';

export interface Evaluation<T = unknown> {
  readonly flagKey: string;
  readonly value: T;
  readonly variant: string;
  readonly reason: EvalReason;
  readonly ruleId?: number;
  readonly bucket?: number;
}

/* ------------------------------------------------------------------ */
/* Bucketing                                                           */
/* ------------------------------------------------------------------ */

/**
 * Consistent hash bucketing — MurmurHash3 x86 32-bit over
 * `flagKey.salt.kind.key`, normalized to [0,100).
 *
 * Murmur3 chosen over FNV because its avalanche quality produces
 * statistically flat buckets even on highly-correlated keys (sequential
 * user ids) — verified by the chi-square test in __tests__.
 */
export function bucketFor(flagKey: string, kind: string, key: BucketKey, salt = ''): number {
  const seedKey = `${flagKey}.${salt}.${kind}.${key}`;
  return (murmur3(seedKey) % 100 + 100) % 100; // normalize to 0-99
}

/**
 * MurmurHash3 x86_32 — public domain algorithm by Austin Appleby.
 * O(n) over the key, ~4 bytes/iteration. Returns uint32.
 */
export function murmur3(key: string, seed = 0): number {
  let h = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const len = key.length;
  const nblocks = len >> 2;

  for (let i = 0; i < nblocks; i++) {
    const j = i << 2;
    let k =
      key.charCodeAt(j) |
      (key.charCodeAt(j + 1) << 8) |
      (key.charCodeAt(j + 2) << 16) |
      (key.charCodeAt(j + 3) << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }

  let k1 = 0;
  const tail = nblocks << 2;
  switch (len & 3) {
    case 3:
      k1 ^= key.charCodeAt(tail + 2) << 16;
      k1 ^= key.charCodeAt(tail + 1) << 8;
      k1 ^= key.charCodeAt(tail);
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h ^= k1;
      break;
    case 2:
      k1 ^= key.charCodeAt(tail + 1) << 8;
      k1 ^= key.charCodeAt(tail);
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h ^= k1;
      break;
    case 1:
      k1 ^= key.charCodeAt(tail);
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h ^= k1;
  }

  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Picks a variant for a bucket given weighted rollout. Weights are
 * normalized against their sum (so `{a: 1, b: 1}` = 50/50). Deterministic
 * for a given bucket — the same user always gets the same variant.
 */
export function variantForBucket(rollout: Rollout, bucket: number): string | undefined {
  const total = rollout.weights.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) {
    return undefined;
  }
  // Map bucket (0-99) onto the normalized weight range.
  const target = (bucket / 100) * total;
  let acc = 0;
  for (const w of rollout.weights) {
    acc += w.weight;
    if (target < acc) {
      return w.variant;
    }
  }
  return rollout.weights[rollout.weights.length - 1]?.variant;
}

/* ------------------------------------------------------------------ */
/* Clause evaluation                                                   */
/* ------------------------------------------------------------------ */

export function evalClause(clause: TargetClause, attributes: Record<string, unknown>): boolean {
  const actual = attributes[clause.attribute];
  if (clause.op === 'exists') {
    return actual !== undefined;
  }
  if (actual === undefined) {
    return clause.op === 'neq';
  }
  const expected = clause.value;
  switch (clause.op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'notIn':
      return !Array.isArray(expected) || !expected.includes(actual);
    case 'contains':
      return (
        (typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)) ||
        (Array.isArray(actual) && actual.includes(expected))
      );
    case 'startsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'endsWith':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'matches': {
      if (typeof actual !== 'string' || expected === undefined) {
        return false;
      }
      const src = expected instanceof RegExp ? expected : toRegex(expected);
      return src !== null && src.test(actual);
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof actual !== 'number' || typeof expected !== 'number') {
        return false;
      }
      return cmpNum(clause.op, actual, expected);
    }
    case 'semverGt':
    case 'semverGte':
    case 'semverLt':
    case 'semverLte': {
      if (typeof actual !== 'string' || typeof expected !== 'string') {
        return false;
      }
      const c = compareSemver(actual, expected);
      if (c === null) {
        return false;
      }
      return cmpNum(
        { semverGt: 'gt', semverGte: 'gte', semverLt: 'lt', semverLte: 'lte' }[clause.op] as 'gt' | 'gte' | 'lt' | 'lte',
        c,
        0
      );
    }
    default:
      return false;
  }
}

function cmpNum(op: 'gt' | 'gte' | 'lt' | 'lte', a: number, b: number): boolean {
  switch (op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
  }
}

function toRegex(v: unknown): RegExp | null {
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

/** Strict semver compare (numeric identifiers only): 1.10.2 > 1.9.9. */
export function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return null;
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  // Pre-release: absent > present.
  const preA = a.split('-')[1];
  const preB = b.split('-')[1];
  if (preA === undefined && preB === undefined) {
    return 0;
  }
  if (preA === undefined) {
    return 1;
  }
  if (preB === undefined) {
    return -1;
  }
  return preA < preB ? -1 : preA > preB ? 1 : 0;
}

function parseSemver(v: string): [number, number, number] | null {
  const core = v.split('+')[0].split('-')[0];
  const parts = core.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const nums = parts.map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : NaN));
  if (nums.some(Number.isNaN)) {
    return null;
  }
  return [nums[0], nums[1], nums[2]];
}
