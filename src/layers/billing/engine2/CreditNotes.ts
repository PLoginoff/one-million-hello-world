/**
 * Credit Notes & Refunds
 *
 * Post-invoice adjustments: a credit note partially or fully offsets an
 * invoice (returns to the buyer as account credit); a refund moves
 * money back. Both link to their invoice and can be partial — the
 * ledger tracks remaining creditable balance so over-refunding an
 * invoice is impossible by construction.
 *
 * Credit notes are also how cancellations under consumer-protection
 * rules work: void the invoice without rewriting history.
 *
 * @module BillingLayer/Engine2
 */

export type Money = number; // minor units

export interface CreditNote {
  readonly id: string;
  readonly invoiceId: string;
  readonly amount: Money;
  readonly reason: string;
  readonly issuedAtMs: number;
  readonly lines?: readonly { description: string; amount: Money }[];
}

export interface Refund {
  readonly id: string;
  readonly invoiceId: string;
  readonly creditNoteId?: string;
  readonly amount: Money;
  readonly method: 'original' | 'balance' | 'manual';
  readonly issuedAtMs: number;
  readonly status: 'pending' | 'completed' | 'failed';
}

interface InvoiceBalance {
  invoiceTotal: Money;
  credited: Money;
  refunded: Money;
}

export class CreditNoteError extends Error {
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CreditNoteError';
  }
}

export class CreditLedger2 {
  private readonly _invoices = new Map<string, InvoiceBalance>();
  private readonly _notes = new Map<string, CreditNote>();
  private readonly _refunds = new Map<string, Refund>();
  private readonly _byInvoice = new Map<string, string[]>();
  private _seq = 0;

  constructor(private readonly _clock: { now(): number } = { now: () => Date.now() }) {}

  /** Register an invoice's total — the ceiling for credits+refunds. */
  registerInvoice(invoiceId: string, total: Money): void {
    if (this._invoices.has(invoiceId)) {
      throw new CreditNoteError('DUPLICATE', `invoice ${invoiceId} already registered`);
    }
    this._invoices.set(invoiceId, { invoiceTotal: total, credited: 0, refunded: 0 });
  }

  /** Outstanding amount that can still be credited on an invoice. */
  creditableBalance(invoiceId: string): Money {
    const b = this._invoices.get(invoiceId);
    if (!b) throw new CreditNoteError('NOT_FOUND', `unknown invoice ${invoiceId}`);
    return b.invoiceTotal - b.credited;
  }

  /** Outstanding amount that can still be refunded (paid & not refunded). */
  refundableBalance(invoiceId: string): Money {
    const b = this._invoices.get(invoiceId);
    if (!b) throw new CreditNoteError('NOT_FOUND', `unknown invoice ${invoiceId}`);
    return b.invoiceTotal - b.refunded;
  }

  /**
   * Issue a credit note against an invoice — reduces the amount owed.
   * Amount may be partial; multiple notes accumulate.
   */
  issueCreditNote(invoiceId: string, amount: Money, reason: string): CreditNote {
    const b = this._invoices.get(invoiceId);
    if (!b) throw new CreditNoteError('NOT_FOUND', `unknown invoice ${invoiceId}`);
    if (amount <= 0) throw new CreditNoteError('INVALID', 'credit amount must be positive');
    if (amount > this.creditableBalance(invoiceId)) {
      throw new CreditNoteError(
        'EXCEEDS_BALANCE',
        `credit ${amount} exceeds remaining balance ${this.creditableBalance(invoiceId)}`
      );
    }
    b.credited += amount;
    const note: CreditNote = {
      id: `cn-${++this._seq}`,
      invoiceId,
      amount,
      reason,
      issuedAtMs: this._clock.now(),
    };
    this._notes.set(note.id, note);
    this.track(invoiceId, note.id);
    return note;
  }

  /**
   * Refund money back to the payer. Optionally linked to a credit note
   * (common flow: credit note first, refund executes it). A refund
   * never exceeds the invoice total minus prior refunds.
   */
  issueRefund(
    invoiceId: string,
    amount: Money,
    method: Refund['method'],
    creditNoteId?: string
  ): Refund {
    const b = this._invoices.get(invoiceId);
    if (!b) throw new CreditNoteError('NOT_FOUND', `unknown invoice ${invoiceId}`);
    if (amount <= 0) throw new CreditNoteError('INVALID', 'refund amount must be positive');
    if (amount > this.refundableBalance(invoiceId)) {
      throw new CreditNoteError(
        'EXCEEDS_BALANCE',
        `refund ${amount} exceeds refundable ${this.refundableBalance(invoiceId)}`
      );
    }
    b.refunded += amount;
    const refund: Refund = {
      id: `rf-${++this._seq}`,
      invoiceId,
      creditNoteId,
      amount,
      method,
      issuedAtMs: this._clock.now(),
      status: 'completed',
    };
    this._refunds.set(refund.id, refund);
    this.track(invoiceId, refund.id);
    return refund;
  }

  /** All adjustments against an invoice, in issue order. */
  adjustments(invoiceId: string): readonly (CreditNote | Refund)[] {
    const ids = this._byInvoice.get(invoiceId) ?? [];
    return ids
      .map((id) => this._notes.get(id) ?? this._refunds.get(id))
      .filter((x): x is CreditNote | Refund => x !== undefined);
  }

  /** Net amount still owed on an invoice after credits. */
  amountDue(invoiceId: string): Money {
    return this.creditableBalance(invoiceId);
  }

  note(id: string): CreditNote | undefined {
    return this._notes.get(id);
  }

  refund(id: string): Refund | undefined {
    return this._refunds.get(id);
  }

  private track(invoiceId: string, id: string): void {
    const list = this._byInvoice.get(invoiceId) ?? [];
    list.push(id);
    this._byInvoice.set(invoiceId, list);
  }
}
