/**
 * Secrets Rotation — Cron Expression Parser & Scheduler
 *
 * Real 5-field cron parsing (minute hour day-of-month month day-of-week)
 * supporting star, slash steps, single values, ranges, stepped ranges, and
 * comma lists. next(fromMs) finds the next matching minute by bounded
 * forward search — O(max 366 days × 1440 checks) worst case, typically
 * microseconds in practice.
 *
 * This is what "cron-like intervals" means concretely: schedules like
 * "0 3 * * 0" (rotate every Sunday at 03:00) are expressible, not just
 * fixed ms intervals.
 *
 * @module SecretsRotation/Rotation
 */

interface CronField {
  readonly min: number;
  readonly max: number;
  readonly allowed: ReadonlySet<number>;
}

const FIELD_SPECS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dom', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'dow', min: 0, max: 6 }, // 0 = Sunday
] as const;

function parseField(spec: string, min: number, max: number, name: string): CronField {
  const allowed = new Set<number>();
  for (const part of spec.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    if (step < 1) throw new RangeError(`${name}: step must be ≥1 in '${part}'`);
    const base = stepMatch ? stepMatch[1] : part;

    let lo: number;
    let hi: number;
    if (base === '*') {
      lo = min;
      hi = max;
    } else {
      const range = base.match(/^(\d+)-(\d+)$/);
      if (range) {
        lo = parseInt(range[1], 10);
        hi = parseInt(range[2], 10);
      } else if (/^\d+$/.test(base)) {
        lo = parseInt(base, 10);
        hi = stepMatch ? max : lo;
      } else {
        throw new SyntaxError(`${name}: unparseable term '${part}'`);
      }
    }
    if (lo < min || hi > max || lo > hi) {
      throw new RangeError(`${name}: range ${lo}-${hi} outside [${min},${max}]`);
    }
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return { min, max, allowed };
}

export class CronExpression {
  private readonly _fields: readonly CronField[];
  private readonly _raw: string;

  constructor(expression: string) {
    this._raw = expression.trim();
    const parts = this._raw.split(/\s+/);
    if (parts.length !== 5) {
      throw new SyntaxError(`cron expression needs 5 fields, got ${parts.length}: '${expression}'`);
    }
    this._fields = parts.map((p, i) => parseField(p, FIELD_SPECS[i].min, FIELD_SPECS[i].max, FIELD_SPECS[i].name));
  }

  get expression(): string {
    return this._raw;
  }

  /** Does the epoch-ms timestamp match? (Minute granularity.) */
  matches(atMs: number): boolean {
    const d = new Date(atMs);
    // Cron day-of-week OR day-of-month semantics: when BOTH are restricted
    // (non-*), a match in EITHER satisfies the schedule — standard cron.
    const domStar = this._fields[2].allowed.size === 31;
    const dowStar = this._fields[4].allowed.size === 7;
    const domMatch = this._fields[2].allowed.has(d.getUTCDate());
    const dowMatch = this._fields[4].allowed.has(d.getUTCDay());
    const dayOk = domStar || dowStar ? domMatch && dowMatch : domMatch || dowMatch;

    return (
      this._fields[0].allowed.has(d.getUTCMinutes()) &&
      this._fields[1].allowed.has(d.getUTCHours()) &&
      dayOk &&
      this._fields[3].allowed.has(d.getUTCMonth() + 1)
    );
  }

  /**
   * Next matching minute after `fromMs` (exclusive). Searches minute-by-
   * minute up to `limitDays` ahead — bounded so a degenerate schedule like
   * Feb 30 can't loop forever; returns null when nothing matches.
   */
  next(fromMs: number, limitDays = 366): number | null {
    const start = Math.floor(fromMs / 60_000) * 60_000 + 60_000;
    const end = start + limitDays * 24 * 60 * 60_000;
    for (let t = start; t < end; t += 60_000) {
      if (this.matches(t)) return t;
    }
    return null;
  }

  /** First n matches after `fromMs` — for schedule preview/audit. */
  nextN(fromMs: number, n: number): number[] {
    const out: number[] = [];
    let cursor = fromMs;
    for (let i = 0; i < n; i++) {
      const nx = this.next(cursor);
      if (nx === null) break;
      out.push(nx);
      cursor = nx;
    }
    return out;
  }
}
