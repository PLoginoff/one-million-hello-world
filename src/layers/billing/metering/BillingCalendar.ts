/**
 * Billing Calendar
 *
 * Enumerates billing periods for both calendar and anniversary cycles.
 * Kept separate from {@link UsageMeter} so period logic can be unit-tested
 * without touching event storage.
 *
 * @module BillingLayer/Metering
 */

import { BillingPeriod, PeriodKind } from './BillingTypes';
import { periodFor } from './UsageMeter';

/**
 * Stateless period arithmetic. All timestamps are UTC epoch milliseconds —
 * billing calendars deliberately ignore customer timezones so invoices are
 * deterministic and DST-free (UTC months have no DST).
 */
export class BillingCalendar {
  /**
   * The period containing `at`.
   */
  periodContaining(at: number, kind: PeriodKind): BillingPeriod {
    return periodFor(at, kind);
  }

  /**
   * The `n`th period starting at or after `from`. n=0 is the period
   * containing `from`.
   */
  periodAt(from: number, kind: PeriodKind, n: number): BillingPeriod {
    let p = periodFor(from, kind);
    for (let i = 0; i < n; i++) {
      p = this.nextPeriod(p);
    }
    return p;
  }

  /**
   * Iterate `count` consecutive periods starting with the one containing
   * `from`.
   */
  periods(from: number, kind: PeriodKind, count: number): readonly BillingPeriod[] {
    const out: BillingPeriod[] = [];
    let p = periodFor(from, kind);
    for (let i = 0; i < count; i++) {
      out.push(p);
      p = this.nextPeriod(p);
    }
    return out;
  }

  /**
   * The period immediately following `p`.
   */
  nextPeriod(p: BillingPeriod): BillingPeriod {
    return periodFor(p.end, p.kind);
  }

  /**
   * The period immediately before `p`.
   */
  previousPeriod(p: BillingPeriod): BillingPeriod {
    return periodFor(p.start - 1, p.kind);
  }

  /**
   * Whole days in the period (UTC). Anniversaries clamped to month end can
   * yield periods of 28–31 days.
   */
  daysInPeriod(p: BillingPeriod): number {
    return Math.round((p.end - p.start) / 86_400_000);
  }
}
