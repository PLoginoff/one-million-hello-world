/**
 * Cron Parser (5-field)
 *
 * Same grammar as the reporting layer's cron (kept independent so layers
 * don't cross-import): min hour dom month dow, with `*`, lists, ranges,
 * steps. Next-run is computed in UTC — DST behavior is documented below.
 *
 * DST NOTE: all computation is in UTC, which has no daylight-saving
 * transitions. A cron like `30 2 * * *` fires at 02:30 UTC year-round; on
 * zones that observe DST this lands on different local times across the
 * year. For a "wall-clock 2:30am local" semantic, a zone-aware cron would
 * be needed — intentionally out of scope; the scheduler documents UTC as
 * its canonical model so behavior is total (no ambiguous or skipped times).
 *
 * @module SchedulingLayer/Scheduler
 */

import { SchedulerError } from './SchedulerTypes';

interface Field {
  readonly min: number;
  readonly max: number;
  /** Allowed values; null = wildcard. */
  readonly values: ReadonlySet<number> | null;
}

export class CronSchedule {
  private readonly _minute: Field;
  private readonly _hour: Field;
  private readonly _dom: Field;
  private readonly _month: Field;
  private readonly _dow: Field;
  readonly expression: string;

  constructor(expr: string) {
    this.expression = expr;
    const f = expr.trim().split(/\s+/);
    if (f.length !== 5) {
      throw new SchedulerError('INVALID_CRON', `cron needs 5 fields, got ${f.length}: '${expr}'`);
    }
    this._minute = parseField(f[0], 0, 59);
    this._hour = parseField(f[1], 0, 23);
    this._dom = parseField(f[2], 1, 31);
    this._month = parseField(f[3], 1, 12);
    this._dow = parseField(f[4], 0, 7);
  }

  /**
   * Next fire time strictly after `from` (epoch ms), UTC. Returns null when
   * nothing matches within ~5 years (e.g. Feb 30 — impossible date).
   */
  nextAfter(from: number): number | null {
    const MIN = 60_000;
    let t = Math.floor(from / MIN) * MIN + MIN;
    const limit = from + 5 * 366 * 24 * 3600_000;
    while (t <= limit) {
      const d = new Date(t);
      if (!hit(this._month, d.getUTCMonth() + 1)) {
        t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
        continue;
      }
      if (!this._dayOk(d)) {
        t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
        continue;
      }
      if (!hit(this._hour, d.getUTCHours())) {
        t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
        continue;
      }
      if (!hit(this._minute, d.getUTCMinutes())) {
        t += MIN;
        continue;
      }
      return t;
    }
    return null;
  }

  /** All fire times in (from, to]. */
  between(from: number, to: number): readonly number[] {
    const out: number[] = [];
    let t = from;
    for (;;) {
      const n = this.nextAfter(t);
      if (n === null || n > to) break;
      out.push(n);
      t = n;
    }
    return out;
  }

  private _dayOk(d: Date): boolean {
    const domR = this._dom.values !== null;
    const dowR = this._dow.values !== null;
    const domOk = hit(this._dom, d.getUTCDate());
    const dowVal = d.getUTCDay();
    const dowOk =
      this._dow.values === null ||
      this._dow.values.has(dowVal) ||
      (dowVal === 0 && this._dow.values.has(7));
    if (domR && dowR) return domOk || dowOk; // classic OR semantics
    if (domR) return domOk;
    if (dowR) return dowOk;
    return true;
  }
}

function hit(f: Field, v: number): boolean {
  return f.values === null || f.values.has(v);
}

function parseField(text: string, min: number, max: number): Field {
  if (text === '*') return { min, max, values: null };
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : parseInt(stepText, 10);
    if (!Number.isFinite(step) || step < 1) {
      throw new SchedulerError('INVALID_CRON', `invalid step in '${text}'`);
    }
    let lo: number, hi: number;
    if (range === '*') {
      lo = min; hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map((x) => parseInt(x, 10));
      lo = a; hi = b;
    } else {
      lo = hi = parseInt(range, 10);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
      throw new SchedulerError('INVALID_CRON', `'${range}' outside [${min},${max}]`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { min, max, values };
}
