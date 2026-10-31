/**
 * Schema-Validated Event Tracker
 *
 * Custom event intake for product analytics: callers register a closed
 * schema per event name (typed fields, enums, numeric ranges), then
 * every submitted event is validated against it before storage.
 *
 * Sampling is *deterministic*: a stable hash of
 * `subjectId|eventName` picks the sampling bucket, so the same
 * subject is consistently kept or dropped for a given event name —
 * dashboards stay coherent per-user instead of flickering. Events
 * without a subject fall back to an injectable random source.
 *
 * Complexity:
 *  - registerSchema():  O(fields)
 *  - track():           O(fields) validation + O(1) hash + O(1) store
 *  - query():           O(stored events) scan with early limit exit
 *
 * @module AnalyticsLayer/Engine2
 */

import {
  AnalyticsClock2,
  EventFieldSpec,
  EventSchema,
  EventSchemaStats,
  SystemAnalyticsClock2,
  TrackResult,
  TrackedEvent,
  TrackedEventInput,
  ValidationIssue,
} from './types';

/** Random source used for anonymous-event sampling. */
export interface RandomSource {
  /** Uniform value in [0, 1). */
  next(): number;
}

export class DefaultRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

/** Deterministic random source for tests (cycles given values). */
export class SequenceRandomSource implements RandomSource {
  private _i = 0;
  constructor(private readonly values: readonly number[] = [0.5]) {}
  next(): number {
    const v = this.values[this._i % this.values.length]!;
    this._i++;
    return v;
  }
}

export interface EventTrackerOptions {
  readonly clock?: AnalyticsClock2;
  readonly random?: RandomSource;
  /** Cap on stored events; oldest evicted first (default 100_000). */
  readonly maxStoredEvents?: number;
}

/**
 * FNV-1a 32-bit hash — cheap, stable across processes (no crypto
 * needed for sampling; we need uniformity, not secrecy).
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Map a hash to a uniform bucket in [0, 1). */
function hashBucket(key: string): number {
  return fnv1a(key) / 0x1_0000_0000;
}

/** Validate one property value against its spec; null = ok. */
function checkField(
  field: string,
  spec: EventFieldSpec,
  value: string | number | boolean
): ValidationIssue | null {
  const actual = typeof value as 'string' | 'number' | 'boolean';
  if (actual !== spec.type) {
    return {
      field,
      reason: 'wrong-type',
      detail: `expected ${spec.type}, got ${actual}`,
    };
  }
  if (spec.type === 'string' && spec.enum !== undefined) {
    if (!spec.enum.includes(value as string)) {
      return {
        field,
        reason: 'not-in-enum',
        detail: `value ${JSON.stringify(value)} not in enum`,
      };
    }
  }
  if (spec.type === 'number') {
    const n = value as number;
    if (spec.min !== undefined && n < spec.min) {
      return { field, reason: 'out-of-range', detail: `${n} < min ${spec.min}` };
    }
    if (spec.max !== undefined && n > spec.max) {
      return { field, reason: 'out-of-range', detail: `${n} > max ${spec.max}` };
    }
  }
  return null;
}

export class EventTracker {
  private readonly clock: AnalyticsClock2;
  private readonly random: RandomSource;
  private readonly maxStored: number;
  private readonly schemas = new Map<string, EventSchema>();
  private readonly stored: TrackedEvent[] = [];
  private readonly stats = new Map<string, { valid: number; invalid: number; sampledOut: number; stored: number }>();
  private seq = 0;
  /** Total events evicted by the storage cap. */
  private evicted = 0;

  constructor(options: EventTrackerOptions = {}) {
    this.clock = options.clock ?? new SystemAnalyticsClock2();
    this.random = options.random ?? new DefaultRandomSource();
    this.maxStored = options.maxStoredEvents ?? 100_000;
  }

  /** Register (or replace) a schema for one event name. */
  registerSchema(schema: EventSchema): void {
    if (!schema.name) throw new Error('schema.name is required');
    const rate = schema.sampleRate ?? 1;
    if (rate < 0 || rate > 1) throw new Error('sampleRate must be in [0,1]');
    this.schemas.set(schema.name, schema);
    if (!this.stats.has(schema.name)) {
      this.stats.set(schema.name, { valid: 0, invalid: 0, sampledOut: 0, stored: 0 });
    }
  }

  /** Drop a schema; subsequent events of that name are rejected. */
  unregisterSchema(name: string): boolean {
    return this.schemas.delete(name);
  }

  /** Validate a single event without storing it. */
  validate(input: TrackedEventInput): readonly ValidationIssue[] {
    const schema = this.schemas.get(input.name);
    if (!schema) {
      return [
        {
          field: input.name,
          reason: 'unknown-event',
          detail: `no schema registered for ${JSON.stringify(input.name)}`,
        },
      ];
    }
    const props = input.properties ?? {};
    const issues: ValidationIssue[] = [];

    for (const [field, spec] of Object.entries(schema.fields)) {
      const v = props[field];
      if (v === undefined) {
        if (!spec.optional) {
          issues.push({
            field,
            reason: 'missing-required',
            detail: `required property ${field} missing`,
          });
        }
        continue;
      }
      const issue = checkField(field, spec, v);
      if (issue) issues.push(issue);
    }

    if (!schema.allowExtra) {
      const known = new Set(Object.keys(schema.fields));
      for (const k of Object.keys(props)) {
        if (!known.has(k)) {
          issues.push({
            field: k,
            reason: 'unknown-field',
            detail: `property ${k} not declared in schema`,
          });
        }
      }
    }
    return issues;
  }

  /**
   * Validate, sample and store an event.
   *
   * Order of operations is deliberate: validation runs before
   * sampling so schema bugs surface even in sampled-out traffic,
   * and `valid`/`invalid` stats reflect true intake quality.
   */
  track(input: TrackedEventInput): TrackResult {
    const schema = this.schemas.get(input.name);
    const stat = this.ensureStats(input.name);
    const issues = this.validate(input);

    if (issues.length > 0) {
      stat.invalid++;
      return { accepted: false, name: input.name, sampledOut: false, issues };
    }
    stat.valid++;

    // Deterministic sampling: keyed on subject so a user is wholly
    // in or out of the sample for a given event name.
    const rate = schema?.sampleRate ?? 1;
    if (rate < 1) {
      const roll =
        input.subjectId !== undefined
          ? hashBucket(`${input.subjectId}|${input.name}`)
          : this.random.next();
      if (roll >= rate) {
        stat.sampledOut++;
        return { accepted: false, name: input.name, sampledOut: true, issues: [] };
      }
    }

    const ev: TrackedEvent = {
      name: input.name,
      properties: { ...(input.properties ?? {}) },
      subjectId: input.subjectId,
      timestamp: input.timestamp ?? this.clock.now(),
      seq: ++this.seq,
    };
    this.stored.push(ev);
    stat.stored++;
    if (this.stored.length > this.maxStored) {
      this.stored.shift();
      this.evicted++;
    }
    return { accepted: true, name: input.name, sampledOut: false, issues: [] };
  }

  /** Batch-track; results arrive in the same order as inputs. */
  trackAll(inputs: readonly TrackedEventInput[]): TrackResult[] {
    return inputs.map((i) => this.track(i));
  }

  /**
   * Scan stored events. Filters are ANDed; `limit` applies after
   * `offset`. Oldest first.
   */
  query(filter: {
    name?: string;
    subjectId?: string;
    fromMs?: number;
    toMs?: number;
    offset?: number;
    limit?: number;
  } = {}): readonly TrackedEvent[] {
    const out: TrackedEvent[] = [];
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? Number.POSITIVE_INFINITY;
    let skipped = 0;
    for (const e of this.stored) {
      if (filter.name !== undefined && e.name !== filter.name) continue;
      if (filter.subjectId !== undefined && e.subjectId !== filter.subjectId) continue;
      if (filter.fromMs !== undefined && e.timestamp < filter.fromMs) continue;
      if (filter.toMs !== undefined && e.timestamp >= filter.toMs) continue;
      if (skipped < offset) {
        skipped++;
        continue;
      }
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Per-schema counters, sorted by event name. */
  schemaStats(): readonly EventSchemaStats[] {
    return [...this.stats.entries()]
      .map(([name, s]) => ({
        name,
        valid: s.valid,
        invalid: s.invalid,
        sampledOut: s.sampledOut,
        stored: s.stored,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Current number of stored events. */
  get size(): number {
    return this.stored.length;
  }

  /** Events dropped due to the storage cap. */
  get evictedCount(): number {
    return this.evicted;
  }

  private ensureStats(name: string): { valid: number; invalid: number; sampledOut: number; stored: number } {
    let s = this.stats.get(name);
    if (!s) {
      s = { valid: 0, invalid: 0, sampledOut: 0, stored: 0 };
      this.stats.set(name, s);
    }
    return s;
  }
}

