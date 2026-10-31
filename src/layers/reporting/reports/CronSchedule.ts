/**
 * Cron Schedule (5-field)
 *
 * Parses standard 5-field cron expressions (min hour dom month dow)
 * with star, lists 'a,b,c', ranges 'a-b', and step forms.
 * Next-run computation advances minute-by-minute with a 5-year bound.
 *
 * dow accepts 0-7 (0 and 7 = Sunday). The DOM/DOW rule follows the
 * classic cron OR-semantics: when BOTH are restricted (not star), a day
 * matches if EITHER matches.
 *
 * @module ReportingLayer/Reports
 */

import { ReportError } from './ReportTypes';

interface FieldSpec {
  readonly min: number;
  readonly max: number;
  /** Sorted unique allowed values, or null = wildcard. */
  readonly values: ReadonlySet<number> | null;
}

export class CronExpression {
  private readonly _minute: FieldSpec;
  private readonly _hour: FieldSpec;
  private readonly _dom: FieldSpec;
  private readonly _month: FieldSpec;
  private readonly _dow: FieldSpec;
  readonly raw: string;

  constructor(expr: string) {
    this.raw = expr;
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) {
      throw new ReportError('INVALID_CRON', `expected 5 fields, got ${fields.length} in '${expr}'`);
    }
    this._minute = parseField(fields[0], 0, 59);
    this._hour = parseField(fields[1], 0, 23);
    this._dom = parseField(fields[2], 1, 31);
    this._month = parseField(fields[3], 1, 12);
    this._dow = parseField(fields[4], 0, 7);
  }

  /** Whether epoch-ms `t` falls on a matching minute. */
  matches(t: number): boolean {
    const d = new Date(t);
    return (
      fieldMatch(this._minute, d.getUTCMinutes()) &&
      fieldMatch(this._hour, d.getUTCHours()) &&
      this._dayMatch(d)
    );
  }

  /**
   * Next matching time strictly after `from` (epoch ms), or null if none
   * within 5 years. Advances to the start of the next minute, then scans.
   */
  next(from: number): number | null {
    const MIN = 60_000;
    let t = Math.floor(from / MIN) * MIN + MIN; // next minute boundary
    const limit = from + 5 * 366 * 24 * 3600_000;
    // Fast path: skip months/days that can't match instead of scanning
    // minute-by-minute for years.
    while (t <= limit) {
      const d = new Date(t);
      if (!fieldMatch(this._month, d.getUTCMonth() + 1)) {
        t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
        continue;
      }
      if (!this._dayMatch(d)) {
        t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
        continue;
      }
      if (!fieldMatch(this._hour, d.getUTCHours())) {
        t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
        continue;
      }
      if (!fieldMatch(this._minute, d.getUTCMinutes())) {
        t += MIN;
        continue;
      }
      return t;
    }
    return null;
  }

  /**
   * Enumerate the next `n` run times after `from`.
   */
  nextN(from: number, n: number): readonly number[] {
    const out: number[] = [];
    let t = from;
    for (let i = 0; i < n; i++) {
      const nx = this.next(t);
      if (nx === null) break;
      out.push(nx);
      t = nx;
    }
    return out;
  }

  /**
   * Classic cron DOM/DOW semantics: if both restricted → OR; if only one
   * restricted → that one decides; both `*` → always true.
   */
  private _dayMatch(d: Date): boolean {
    const domRestricted = this._dom.values !== null;
    const dowRestricted = this._dow.values !== null;
    const domOk = fieldMatch(this._dom, d.getUTCDate());
    const dowVal = d.getUTCDay();
    // 0 and 7 both mean Sunday — normalize 7→0 for matching.
    const dowOk =
      this._dow.values === null ||
      this._dow.values.has(dowVal) ||
      (dowVal === 0 && this._dow.values.has(7));
    if (domRestricted && dowRestricted) return domOk || dowOk;
    if (domRestricted) return domOk;
    if (dowRestricted) return dowOk;
    return true;
  }
}

function fieldMatch(spec: FieldSpec, v: number): boolean {
  return spec.values === null || spec.values.has(v);
}

/**
 * Parse one cron field. Supports star, single values, lists, ranges, steps.
 */
function parseField(text: string, min: number, max: number): FieldSpec {
  if (text === '*') return { min, max, values: null };
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const stepSplit = part.split('/');
    const range = stepSplit[0];
    const step = stepSplit.length > 1 ? parseInt(stepSplit[1], 10) : 1;
    if (!Number.isFinite(step) || step < 1) {
      throw new ReportError('INVALID_CRON', `bad step in '${text}'`);
    }
    let lo: number, hi: number;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map((x) => parseInt(x, 10));
      lo = a;
      hi = b;
    } else {
      lo = hi = parseInt(range, 10);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
      throw new ReportError('INVALID_CRON', `range '${range}' out of bounds [${min},${max}]`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v === 7 && max === 7 ? 7 : v);
  }
  return { min, max, values };
}
