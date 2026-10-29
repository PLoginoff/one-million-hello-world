/**
 * Usage Meter
 *
 * Ingests {@link UsageEvent}s with idempotent deduplication and aggregates
 * them per (customer, meter, dimension-key) inside billing periods.
 *
 * Storage layout:
 * - `_seen`      : Map<customerId, Set<idempotencyKey>> — dedup index
 * - `_buckets`   : Map<customerId, Map<bucketKey, number>> — running totals
 *   where bucketKey = `${meter}|${periodStart}|${dimsHash}`
 *
 * Dedup is O(1) amortized; aggregation is O(1) per event.
 *
 * @module BillingLayer/Metering
 */

import { BillingPeriod, MeteringError, PeriodKind, UsageEvent } from './BillingTypes';
import { BillingCalendar } from './BillingCalendar';

/** Aggregated usage for one meter+dimension bucket inside a period. */
export interface UsageAggregate {
  readonly meter: string;
  readonly customerId: string;
  readonly quantity: number;
  readonly period: BillingPeriod;
  readonly dimensions?: Readonly<Record<string, string>>;
}

/**
 * Hash a dimensions object into a stable string. Keys are sorted so
 * {a:1,b:2} and {b:2,a:1} produce the same bucket.
 */
function dimsKey(dims?: Readonly<Record<string, string>>): string {
  if (!dims) return '';
  return Object.keys(dims)
    .sort()
    .map((k) => `${k}=${dims[k]}`)
    .join(',');
}

/**
 * Compute the billing period that contains `at` for a given period kind.
 *
 * For 'calendar': the UTC calendar month containing `at`.
 * For 'anniversary': the month starting on `anchorDay` (clamped to month
 * length, e.g. anchor 31 in February → last day of Feb).
 */
export function periodFor(at: number, kind: PeriodKind): BillingPeriod {
  if (kind.kind === 'calendar') {
    const d = new Date(at);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    return { start, end, kind };
  }
  // anniversary
  const anchor = kind.anchorDay;
  const d = new Date(at);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  // Candidate start is this month's anchor day; if `at` is before it,
  // the period began last month.
  const thisStart = clampedAnchorStart(year, month, anchor);
  if (at < thisStart) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  const start = clampedAnchorStart(year, month, anchor);
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }
  const end = clampedAnchorStart(nextYear, nextMonth, anchor);
  return { start, end, kind };
}

/**
 * Anchor day-of-month clamped to the last day of the target month, returned
 * as an epoch ms UTC timestamp. E.g. anchor=31, Feb 2024 → 2024-02-29.
 */
function clampedAnchorStart(year: number, month: number, anchorDay: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return Date.UTC(year, month, day);
}

/**
 * The UsageMeter is the write-side of metering: it accepts events, rejects
 * duplicates, and exposes per-period aggregates for the invoice builder.
 */
export class UsageMeter {
  /** customerId → set of consumed idempotency keys. */
  private readonly _seen = new Map<string, Set<string>>();
  /** customerId → bucketKey → quantity. */
  private readonly _buckets = new Map<string, Map<string, number>>();
  /** customerId → bucketKey → metadata (dims, meter, period). */
  private readonly _bucketMeta = new Map<string, Map<string, Omit<UsageAggregate, 'quantity'>>>();
  private readonly _calendar = new BillingCalendar();

  /**
   * Ingest one usage event. Returns true if stored, false if it was a
   * duplicate (same customer + idempotency key).
   */
  record(event: UsageEvent): boolean {
    this._validate(event);
    let seen = this._seen.get(event.customerId);
    if (!seen) {
      seen = new Set();
      this._seen.set(event.customerId, seen);
    }
    if (seen.has(event.idempotencyKey)) {
      return false; // idempotent no-op
    }
    seen.add(event.idempotencyKey);
    // Note: bucket assignment requires knowing the period kind; callers
    // aggregate via aggregateForPeriod() which re-buckets by raw events.
    // To keep record() O(1) we store raw events in a per-customer list.
    this._rawEvents(event.customerId).push(event);
    return true;
  }

  /**
   * Ingest a batch; returns the number of *new* (non-duplicate) events.
   */
  recordBatch(events: readonly UsageEvent[]): number {
    let stored = 0;
    for (const e of events) {
      if (this.record(e)) stored++;
    }
    return stored;
  }

  /**
   * Sum all usage for (customer, meter) inside `period`, optionally filtered
   * by exact dimensions match. Runs in O(events) — fine for in-memory use;
   * a production impl would maintain per-period index buckets.
   */
  aggregateForPeriod(
    customerId: string,
    meter: string,
    period: BillingPeriod,
    dimensions?: Readonly<Record<string, string>>
  ): number {
    const wantDims = dimsKey(dimensions);
    let total = 0;
    for (const e of this._rawEvents(customerId)) {
      if (e.meter !== meter) continue;
      if (e.occurredAt < period.start || e.occurredAt >= period.end) continue;
      if (dimsKey(e.dimensions) !== wantDims) continue;
      total += e.quantity;
    }
    return total;
  }

  /**
   * Produce one {@link UsageAggregate} per distinct (meter, dimensions)
   * bucket present in the period. Used by the invoice builder so each
   * dimension group becomes its own invoice line.
   */
  aggregatesForPeriod(
    customerId: string,
    period: BillingPeriod
  ): readonly UsageAggregate[] {
    const byKey = new Map<string, UsageAggregate & { quantity: number }>();
    for (const e of this._rawEvents(customerId)) {
      if (e.occurredAt < period.start || e.occurredAt >= period.end) continue;
      const key = `${e.meter}|${dimsKey(e.dimensions)}`;
      const existing = byKey.get(key);
      if (existing) {
        (existing as { quantity: number }).quantity += e.quantity;
      } else {
        byKey.set(key, {
          meter: e.meter,
          customerId,
          quantity: e.quantity,
          period,
          dimensions: e.dimensions,
        });
      }
    }
    return Array.from(byKey.values());
  }

  /** Number of distinct idempotency keys seen for a customer. */
  eventCount(customerId: string): number {
    return this._seen.get(customerId)?.size ?? 0;
  }

  /**
   * Forget all events and aggregates for a customer (e.g. after account
   * closure). Returns the number of events dropped.
   */
  purgeCustomer(customerId: string): number {
    const n = this.eventCount(customerId);
    this._seen.delete(customerId);
    this._raw.delete(customerId);
    this._buckets.delete(customerId);
    this._bucketMeta.delete(customerId);
    return n;
  }

  /**
   * Current billing period for `kind` containing `now`.
   */
  currentPeriod(kind: PeriodKind, now: number): BillingPeriod {
    return periodFor(now, kind);
  }

  // ------------------------------------------------------------------ privates

  /** Raw event store, lazily created per customer. */
  private readonly _raw = new Map<string, UsageEvent[]>();

  private _rawEvents(customerId: string): UsageEvent[] {
    let list = this._raw.get(customerId);
    if (!list) {
      list = [];
      this._raw.set(customerId, list);
    }
    return list;
  }

  private _validate(e: UsageEvent): void {
    if (!e.customerId) throw new MeteringError('INVALID_EVENT', 'customerId required');
    if (!e.meter) throw new MeteringError('INVALID_EVENT', 'meter required');
    if (!e.idempotencyKey) throw new MeteringError('INVALID_EVENT', 'idempotencyKey required');
    if (!Number.isFinite(e.quantity)) {
      throw new MeteringError('INVALID_EVENT', `quantity must be finite, got ${e.quantity}`);
    }
    if (!Number.isFinite(e.occurredAt)) {
      throw new MeteringError('INVALID_EVENT', 'occurredAt must be a timestamp');
    }
  }
}
