/**
 * Credit Ledger
 *
 * Tracks per-customer promotional/adjustment credits and negative balances.
 * Credits are consumed in FIFO order (earliest-issued first) when an invoice
 * is settled. The ledger can go negative to represent an amount the customer
 * still owes after payment failures.
 *
 * Invariants:
 *  - entry amounts are immutable once issued
 *  - `balance()` is the single source of truth: sum(issued) − sum(consumed)
 *
 * @module BillingLayer/Metering
 */

import { CreditEntry, MeteringError } from './BillingTypes';

interface ConsumedEntry {
  readonly creditId: string;
  readonly amountCents: number;
}

export class CreditLedger {
  /** customerId → issued entries (FIFO order preserved). */
  private readonly _entries = new Map<string, CreditEntry[]>();
  /** customerId → consumed amounts keyed by creditId. */
  private readonly _consumed = new Map<string, ConsumedEntry[]>();

  /**
   * Issue a credit. `creditId` is caller-supplied and must be unique per
   * customer (idempotent re-issue is a no-op returning false).
   */
  issue(entry: CreditEntry): boolean {
    const list = this._entries.get(entry.customerId) ?? [];
    if (list.some((e) => e.creditId === entry.creditId)) {
      return false;
    }
    list.push(entry);
    this._entries.set(entry.customerId, list);
    return true;
  }

  /**
   * Current balance in minor units. Positive = credit available,
   * negative = balance due.
   */
  balance(customerId: string): number {
    const issued = (this._entries.get(customerId) ?? []).reduce(
      (s, e) => s + e.amountCents,
      0
    );
    const consumed = (this._consumed.get(customerId) ?? []).reduce(
      (s, e) => s + e.amountCents,
      0
    );
    return issued - consumed;
  }

  /**
   * Consume up to `amountCents` from the FIFO credit pool to settle an
   * invoice. Returns the amount actually applied (≤ amountCents, ≥ 0 when
   * balance positive).
   *
   * If the balance is negative (amount due), this returns 0 — negative
   * balances are paid via the dunning flow, not the credit pool.
   */
  apply(customerId: string, amountCents: number): number {
    if (amountCents <= 0) return 0;
    let remaining = Math.min(amountCents, Math.max(0, this.balance(customerId)));
    let applied = 0;
    const entries = this._entries.get(customerId) ?? [];
    const consumed = this._consumed.get(customerId) ?? [];
    this._consumed.set(customerId, consumed);

    for (const entry of entries) {
      if (remaining <= 0) break;
      if (entry.amountCents <= 0) continue;
      const already = consumed
        .filter((c) => c.creditId === entry.creditId)
        .reduce((s, c) => s + c.amountCents, 0);
      const available = entry.amountCents - already;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      consumed.push({ creditId: entry.creditId, amountCents: take });
      remaining -= take;
      applied += take;
    }
    return applied;
  }

  /**
   * Record a payment failure: pushes the ledger negative by `amountCents`
   * so future credits first offset the debt. Modelled as a negative-amount
   * credit entry.
   */
  recordDebit(customerId: string, creditId: string, amountCents: number, reason: string): boolean {
    return this.issue({
      creditId,
      customerId,
      amountCents: -Math.abs(amountCents),
      issuedAt: Date.now(),
      reason,
    });
  }

  /**
   * All issued entries for a customer, FIFO order.
   */
  entries(customerId: string): readonly CreditEntry[] {
    return this._entries.get(customerId) ?? [];
  }

  /** Reset a customer (e.g. account close). */
  clear(customerId: string): void {
    this._entries.delete(customerId);
    this._consumed.delete(customerId);
  }
}
