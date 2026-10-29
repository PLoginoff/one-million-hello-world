/**
 * Policy Decision Point (PDP).
 *
 * Evaluates {@link Policy}s and {@link PolicySet}s against
 * {@link PolicyRequest}s, with:
 *
 *  - **Versioned policy store** — multiple versions of a policy coexist;
 *    callers pin a version or take the latest. Version history forms the
 *    audit trail of *policy changes*.
 *  - **Decision cache** — decisions are memoized on a deterministic key of
 *    (subject, resource, action, context-hash, policy-version). A bounded
 *    LRU map; any policy mutation clears it (conservative invalidation —
 *    policy stores change rarely, decisions cache hot).
 *  - **Audit trail** — every `evaluate` emits an {@link AuditRecord} to
 *    subscribers: request fingerprint, decision, deciding rules, timing.
 *  - **Obligation/advice** — returned on the {@link Decision}; a
 *    {@link PolicyEnforcementPoint}-style caller is expected to execute
 *    obligations when the decision is enforced.
 *
 * Evaluation pipeline (per request):
 *  1. Normalize request (action → record).
 *  2. Cache lookup → hit returns the memoized decision (audited as `cached`).
 *  3. Policy target match → mismatch ⇒ `notApplicable`.
 *  4. Rule evaluation in order: rule target match + condition eval
 *     (tri-state: indeterminate bubbles as an `indeterminate` ElementResult).
 *  5. Rule combining → policy decision; attach policy-level obligations.
 *  6. For sets: policy combining over children results recursively.
 *  7. Cache store + audit emit.
 *
 * @module PolicyEngine/Implementations
 */

import {
  Advice,
  CombiningAlgorithm,
  Decision,
  DecisionEffect,
  ElementResult,
  NormalizedRequest,
  Obligation,
  Policy,
  PolicyRequest,
  PolicyRule,
  PolicySet,
  evaluateExpression,
  isPolicySet,
  normalizeRequest,
  targetMatches,
} from '../domain/policy-model';
import { combine } from '../strategies/CombiningAlgorithms';

/* ------------------------------------------------------------------ */
/* Versioned store                                                     */
/* ------------------------------------------------------------------ */

export interface StoredPolicy {
  readonly policy: Policy | PolicySet;
  readonly version: string;
  readonly storedAt: number;
  readonly storedBy?: string;
  readonly comment?: string;
}

export interface PolicyVersionEntry {
  readonly version: string;
  readonly storedAt: number;
  readonly comment?: string;
}

/**
 * In-memory, append-only policy repository keyed by policy id.
 * Versions are monotonically numbered `v1, v2, …` unless caller supplies
 * explicit version strings. Never mutates stored entries — new versions are
 * pushed; retrieval returns the stored object (treated as immutable).
 */
export class PolicyRepository {
  private readonly _store = new Map<string, StoredPolicy[]>();
  private _clock: () => number;

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  setClock(clock: () => number): void {
    this._clock = clock;
  }

  /**
   * Stores a new version of a policy. Returns the assigned version string.
   */
  put(policy: Policy | PolicySet, meta: { version?: string; storedBy?: string; comment?: string } = {}): string {
    const list = this._store.get(policy.id) ?? [];
    const version = meta.version ?? policy.version ?? `v${list.length + 1}`;
    if (list.some((e) => e.version === version)) {
      throw new Error(`Policy ${policy.id} already has version ${version}`);
    }
    list.push({
      policy,
      version,
      storedAt: this._clock(),
      storedBy: meta.storedBy,
      comment: meta.comment,
    });
    this._store.set(policy.id, list);
    return version;
  }

  /** Latest version (last stored). */
  get(id: string): StoredPolicy | undefined {
    const list = this._store.get(id);
    return list && list.length > 0 ? list[list.length - 1] : undefined;
  }

  getVersion(id: string, version: string): StoredPolicy | undefined {
    return this._store.get(id)?.find((e) => e.version === version);
  }

  versions(id: string): PolicyVersionEntry[] {
    return (this._store.get(id) ?? []).map((e) => ({
      version: e.version,
      storedAt: e.storedAt,
      comment: e.comment,
    }));
  }

  remove(id: string): boolean {
    return this._store.delete(id);
  }

  /** Full change history across all policies, chronological. */
  history(): { policyId: string; entry: PolicyVersionEntry }[] {
    const out: { policyId: string; entry: PolicyVersionEntry }[] = [];
    for (const [policyId, list] of this._store) {
      for (const e of list) {
        out.push({ policyId, entry: { version: e.version, storedAt: e.storedAt, comment: e.comment } });
      }
    }
    return out.sort((a, b) => a.entry.storedAt - b.entry.storedAt);
  }
}

/* ------------------------------------------------------------------ */
/* Decision cache                                                      */
/* ------------------------------------------------------------------ */

/**
 * Deterministic structural hash (FNV-1a over canonical JSON). Key order is
 * sorted so semantically-equal requests hash identically — required for the
 * cache key to be stable across callers that build attribute bags in
 * different orders.
 */
export function contextHash(value: unknown): string {
  return fnv1a(canonicalize(value));
}

function canonicalize(v: unknown): string {
  if (v === null || v === undefined) {
    return 'null';
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return JSON.stringify(v);
  }
  if (typeof v === 'string') {
    return JSON.stringify(v);
  }
  if (v instanceof Date) {
    return `"${v.toISOString()}"`;
  }
  if (v instanceof RegExp) {
    return `"${v.source}/${v.flags}"`;
  }
  if (Array.isArray(v)) {
    return `[${v.map(canonicalize).join(',')}]`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(v));
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** LRU-bounded decision cache keyed by structural request hash. */
export class DecisionCache {
  private readonly _map = new Map<string, { decision: Decision; storedAt: number }>();
  private _hits = 0;
  private _misses = 0;

  constructor(readonly capacity = 1024) {}

  key(request: PolicyRequest, policyId: string, policyVersion: string): string {
    const n = normalizeRequest(request);
    return `${policyId}@${policyVersion}:${contextHash([n.subject, n.resource, n.action, n.environment])}`;
  }

  get(key: string): Decision | undefined {
    const e = this._map.get(key);
    if (!e) {
      this._misses++;
      return undefined;
    }
    // LRU touch: reinsert to move to most-recent position.
    this._map.delete(key);
    this._map.set(key, e);
    this._hits++;
    return e.decision;
  }

  set(key: string, decision: Decision): void {
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this.capacity) {
      // Evict least-recently-used (first key in insertion order).
      const oldest = this._map.keys().next();
      if (!oldest.done) {
        this._map.delete(oldest.value);
      }
    }
    this._map.set(key, { decision, storedAt: Date.now() });
  }

  invalidateAll(): void {
    this._map.clear();
  }

  get size(): number {
    return this._map.size;
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this._hits, misses: this._misses, size: this._map.size };
  }
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export interface AuditRecord {
  readonly at: number;
  readonly requestHash: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly decision: DecisionEffect;
  readonly decidingRuleIds: readonly string[];
  readonly cached: boolean;
  readonly durationMs: number;
}

export type AuditListener = (record: AuditRecord) => void;

/* ------------------------------------------------------------------ */
/* PDP                                                                 */
/* ------------------------------------------------------------------ */

export interface PolicyDecisionPointOptions {
  readonly clock?: () => number;
  readonly cacheCapacity?: number;
  /** Default combining algorithm used when callers evaluate ad-hoc rule lists. */
  readonly defaultCombining?: CombiningAlgorithm;
  /** Set false to bypass the decision cache entirely. */
  readonly cacheEnabled?: boolean;
  readonly audit?: AuditListener;
}

export interface EvaluateOptions {
  /** Pin evaluation to a specific stored policy version. */
  readonly version?: string;
  /** Extra context merged into environment attributes (e.g. request id). */
  readonly environment?: Record<string, unknown>;
  /** Bypass cache for this call. */
  readonly skipCache?: boolean;
}

export class PolicyDecisionPoint {
  readonly repository: PolicyRepository;
  private readonly _cache: DecisionCache;
  private readonly _clock: () => number;
  private readonly _defaultCombining: CombiningAlgorithm;
  private readonly _cacheEnabled: boolean;
  private readonly _auditListeners: AuditListener[] = [];

  constructor(options: PolicyDecisionPointOptions = {}) {
    this._clock = options.clock ?? Date.now;
    this.repository = new PolicyRepository(this._clock);
    this._cache = new DecisionCache(options.cacheCapacity ?? 1024);
    this._defaultCombining = options.defaultCombining ?? 'deny-overrides';
    this._cacheEnabled = options.cacheEnabled ?? true;
    if (options.audit) {
      this._auditListeners.push(options.audit);
    }
  }

  onAudit(listener: AuditListener): () => void {
    this._auditListeners.push(listener);
    return () => {
      const i = this._auditListeners.indexOf(listener);
      if (i >= 0) {
        this._auditListeners.splice(i, 1);
      }
    };
  }

  /** Stores a new policy version and invalidates the decision cache. */
  deploy(policy: Policy | PolicySet, meta: { version?: string; storedBy?: string; comment?: string } = {}): string {
    const v = this.repository.put(policy, meta);
    this._cache.invalidateAll();
    return v;
  }

  cacheStats(): { hits: number; misses: number; size: number } {
    return this._cache.stats();
  }

  /**
   * Evaluates a stored policy (by id, optionally pinned version).
   */
  async evaluate(policyId: string, request: PolicyRequest, options: EvaluateOptions = {}): Promise<Decision> {
    const started = this._clock();
    const stored = options.version
      ? this.repository.getVersion(policyId, options.version)
      : this.repository.get(policyId);
    if (!stored) {
      return {
        effect: 'indeterminate',
        obligations: [],
        advice: [],
        decidingPolicyIds: [],
        decidingRuleIds: [],
        reason: options.version
          ? `policy ${policyId}@${options.version} not found`
          : `policy ${policyId} not found`,
      };
    }

    const req: PolicyRequest = options.environment
      ? { ...request, environment: { ...(request.environment ?? {}), ...options.environment } }
      : request;

    const cacheKey = this._cache.key(req, policyId, stored.version);
    if (this._cacheEnabled && !options.skipCache) {
      const hit = this._cache.get(cacheKey);
      if (hit) {
        this._emit(req, stored, hit, true, started);
        return hit;
      }
    }

    const normalized = normalizeRequest(req);
    const result = this._evalElement(stored.policy, normalized);
    const decision = result.decision;
    if (this._cacheEnabled && !options.skipCache && decision.effect !== 'indeterminate') {
      // Indeterminate results are never cached — they may be transient.
      this._cache.set(cacheKey, decision);
    }
    this._emit(req, stored, decision, false, started);
    return decision;
  }

  /**
   * Evaluates an ad-hoc policy object without storing it (decisions still
   * cached under its id + 'inline' version).
   */
  async evaluateInline(policy: Policy | PolicySet, request: PolicyRequest): Promise<Decision> {
    const started = this._clock();
    const normalized = normalizeRequest(request);
    const result = this._evalElement(policy, normalized);
    this._emitRaw(normalized, policy.id, policy.version ?? 'inline', result.decision, false, started);
    return result.decision;
  }

  /* --------------------------- evaluation --------------------------- */

  private _evalElement(element: Policy | PolicySet, req: NormalizedRequest): ElementResult {
    if (isPolicySet(element)) {
      return this._evalPolicySet(element, req);
    }
    return this._evalPolicy(element, req);
  }

  private _evalPolicySet(set: PolicySet, req: NormalizedRequest): ElementResult {
    if (set.target && !targetMatches(set.target, req)) {
      return empty('notApplicable');
    }
    const childResults = set.policies.map((p) => this._evalElement(p, req));
    const decision = combine(set.policyCombining, childResults);
    return this._attach(decision, childResults, set, [set.id]);
  }

  private _evalPolicy(policy: Policy, req: NormalizedRequest): ElementResult {
    if (policy.enabled === false) {
      return empty('notApplicable');
    }
    if (policy.target && !targetMatches(policy.target, req)) {
      return empty('notApplicable');
    }

    const ruleResults: ElementResult[] = [];
    for (const rule of policy.rules) {
      ruleResults.push(this._evalRule(rule, req, policy.id));
    }
    const combined = combine(policy.ruleCombining ?? this._defaultCombining, ruleResults);
    const withPolicy: Decision = {
      ...combined,
      decidingPolicyIds: combined.effect === 'notApplicable' ? [] : [policy.id],
    };
    return {
      decision: withPolicy,
      obligations: mergeById(withPolicy.obligations, policy.obligations ?? []),
      advice: mergeById(withPolicy.advice, policy.advice ?? []),
    };
  }

  private _evalRule(rule: PolicyRule, req: NormalizedRequest, policyId: string): ElementResult {
    if (rule.enabled === false) {
      return empty('notApplicable');
    }
    if (rule.target && !targetMatches(rule.target, req)) {
      return empty('notApplicable');
    }
    if (rule.condition) {
      const tri = evaluateExpression(rule.condition, req);
      if (tri === 'indeterminate') {
        return {
          decision: {
            effect: 'indeterminate',
            obligations: [],
            advice: [],
            decidingPolicyIds: [policyId],
            decidingRuleIds: [rule.id],
            reason: `condition indeterminate in rule ${rule.id}`,
          },
          obligations: [],
          advice: [],
        };
      }
      if (tri === 'false') {
        return empty('notApplicable');
      }
    }
    // Rule matched.
    return {
      decision: {
        effect: rule.effect,
        obligations: rule.obligations ?? [],
        advice: rule.advice ?? [],
        decidingPolicyIds: [policyId],
        decidingRuleIds: [rule.id],
      },
      obligations: rule.obligations ?? [],
      advice: rule.advice ?? [],
    };
  }

  private _attach(
    decision: Decision,
    childResults: readonly ElementResult[],
    owner: { obligations?: readonly Obligation[]; advice?: readonly Advice[] },
    policyIds: readonly string[]
  ): ElementResult {
    const e = decision.effect;
    const applies = e === 'permit' || e === 'deny';
    const mergedObligations = applies
      ? mergeById(
          dedupObligations(childResults.flatMap((r) => (r.decision.effect === e ? r.obligations : []))),
          owner.obligations ?? []
        )
      : [];
    const mergedAdvice = dedupAdvice(
      childResults.flatMap((r) => r.advice).concat(owner.advice ?? [])
    );
    return {
      decision: {
        ...decision,
        obligations: mergedObligations,
        advice: mergedAdvice,
        decidingPolicyIds: applies ? mergeIds(policyIds, decision.decidingPolicyIds) : [],
      },
      obligations: mergedObligations,
      advice: mergedAdvice,
    };
  }

  /* --------------------------- audit --------------------------- */

  private _emit(req: PolicyRequest, stored: StoredPolicy, decision: Decision, cached: boolean, started: number): void {
    this._emitRaw(normalizeRequest(req), stored.policy.id, stored.version, decision, cached, started);
  }

  private _emitRaw(
    req: NormalizedRequest,
    policyId: string,
    policyVersion: string,
    decision: Decision,
    cached: boolean,
    started: number
  ): void {
    const record: AuditRecord = {
      at: this._clock(),
      requestHash: contextHash([req.subject, req.resource, req.action, req.environment]),
      policyId,
      policyVersion,
      decision: decision.effect,
      decidingRuleIds: decision.decidingRuleIds,
      cached,
      durationMs: this._clock() - started,
    };
    for (const l of this._auditListeners) {
      l(record);
    }
  }
}

/* ------------------------------- helpers ------------------------------- */

function empty(effect: DecisionEffect): ElementResult {
  return {
    decision: {
      effect,
      obligations: [],
      advice: [],
      decidingPolicyIds: [],
      decidingRuleIds: [],
    },
    obligations: [],
    advice: [],
  };
}

function mergeById<T extends { id: string }>(base: readonly T[], extra: readonly T[]): T[] {
  const seen = new Set(base.map((b) => b.id));
  return [...base, ...extra.filter((e) => !seen.has(e.id))];
}

function dedupObligations(items: readonly Obligation[]): Obligation[] {
  return mergeById([], items);
}

function dedupAdvice(items: readonly Advice[]): Advice[] {
  return mergeById([], items);
}

function mergeIds(a: readonly string[], b: readonly string[]): string[] {
  const s = new Set(a);
  for (const id of b) {
    s.add(id);
  }
  return [...s];
}
