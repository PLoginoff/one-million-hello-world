/**
 * Invoice PDF-Layout Model
 *
 * A layout tree for invoice documents — sections (header, line items,
 * taxes, discounts, totals, footer) rendered into structured text that
 * a downstream PDF renderer can place. Money is integer minor units
 * (cents) everywhere; the layout computes positions but never
 * floating-point sums.
 *
 * The model is deliberately renderer-agnostic: `render` produces a
 * `LayoutDocument` of positioned text runs with explicit coordinates —
 * feeding it to a real PDF backend is a pure serialization step.
 *
 * @module BillingLayer/Engine2
 */

export type Money = number; // minor units (cents)

export interface InvoiceParty {
  readonly name: string;
  readonly lines?: readonly string[]; // address lines
  readonly taxId?: string;
}

export interface InvoiceLineItem {
  readonly description: string;
  readonly quantity: number;
  /** Unit price in minor units. */
  readonly unitPrice: Money;
  /** Discount applied to this line (minor units, ≥0). */
  readonly discount?: Money;
  /** Tax rate as basis points (1000 = 10%). */
  readonly taxBps?: number;
}

export interface InvoiceModel {
  readonly number: string;
  readonly issueDateMs: number;
  readonly dueDateMs?: number;
  readonly currency: string;
  readonly seller: InvoiceParty;
  readonly buyer: InvoiceParty;
  readonly items: readonly InvoiceLineItem[];
  /** Invoice-level discount (minor units). */
  readonly discount?: Money;
  readonly notes?: readonly string[];
}

/** A positioned text run inside the rendered document. */
export interface TextRun {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly style: 'title' | 'heading' | 'body' | 'muted' | 'mono';
  readonly align?: 'left' | 'right';
}

export interface LayoutSection {
  readonly name: 'header' | 'parties' | 'items' | 'totals' | 'footer';
  readonly runs: readonly TextRun[];
  readonly height: number;
}

export interface LayoutDocument {
  readonly width: number;
  readonly height: number;
  readonly sections: readonly LayoutSection[];
  /** Machine-readable totals for assertions/downstream. */
  readonly totals: InvoiceTotals;
}

export interface InvoiceTotals {
  readonly subtotal: Money;
  readonly lineDiscounts: Money;
  readonly invoiceDiscount: Money;
  readonly taxable: Money;
  readonly tax: Money;
  readonly total: Money;
}

const PAGE_WIDTH = 612; // US-letter at 72dpi
const MARGIN = 48;
const CONTENT_W = PAGE_WIDTH - 2 * MARGIN;
const LINE_H = 14;

/** Sum line items: qty × unitPrice − line discount, then per-line tax. */
export function computeTotals(inv: InvoiceModel): InvoiceTotals {
  let subtotal = 0;
  let lineDiscounts = 0;
  let tax = 0;
  for (const it of inv.items) {
    const gross = Math.round(it.quantity * it.unitPrice);
    const net = gross - (it.discount ?? 0);
    subtotal += gross;
    lineDiscounts += it.discount ?? 0;
    // Tax on the net (discounted) amount.
    tax += Math.round((net * (it.taxBps ?? 0)) / 10_000);
  }
  const invoiceDiscount = inv.discount ?? 0;
  const taxable = subtotal - lineDiscounts - invoiceDiscount;
  return {
    subtotal,
    lineDiscounts,
    invoiceDiscount,
    taxable,
    tax,
    total: taxable + tax,
  };
}

function money(m: Money, currency: string): string {
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  return `${sign}${currency} ${(abs / 100).toFixed(2)}`;
}

/**
 * Lay out an invoice as positioned text runs — a column-aware layout
 * (qty / unit / discount / tax / amount) that a PDF backend can raster
 * verbatim. Pure function.
 */
export function layOutInvoice(inv: InvoiceModel): LayoutDocument {
  const sections: LayoutSection[] = [];
  const totals = computeTotals(inv);
  let y = MARGIN;

  // ---- header
  const header: TextRun[] = [
    { x: MARGIN, y, text: 'INVOICE', style: 'title' },
    { x: PAGE_WIDTH - MARGIN, y, text: inv.number, style: 'heading', align: 'right' },
  ];
  y += LINE_H * 2;
  header.push({
    x: MARGIN,
    y,
    text: `Issued ${new Date(inv.issueDateMs).toISOString().slice(0, 10)}`,
    style: 'muted',
  });
  if (inv.dueDateMs !== undefined) {
    header.push({
      x: PAGE_WIDTH - MARGIN,
      y,
      text: `Due ${new Date(inv.dueDateMs).toISOString().slice(0, 10)}`,
      style: 'muted',
      align: 'right',
    });
  }
  sections.push({ name: 'header', runs: header, height: LINE_H * 2 });
  y += LINE_H;

  // ---- parties: seller left, buyer right
  const parties: TextRun[] = [];
  parties.push({ x: MARGIN, y, text: 'From', style: 'heading' });
  parties.push({ x: MARGIN + CONTENT_W / 2, y, text: 'Bill To', style: 'heading' });
  y += LINE_H;
  const sellerLines = [inv.seller.name, ...(inv.seller.lines ?? []), inv.seller.taxId ?? ''].filter(
    (l) => l.length > 0
  );
  const buyerLines = [inv.buyer.name, ...(inv.buyer.lines ?? []), inv.buyer.taxId ?? ''].filter(
    (l) => l.length > 0
  );
  const partyRows = Math.max(sellerLines.length, buyerLines.length);
  for (let i = 0; i < partyRows; i++) {
    if (i < sellerLines.length) {
      parties.push({ x: MARGIN, y: y + i * LINE_H, text: sellerLines[i], style: 'body' });
    }
    if (i < buyerLines.length) {
      parties.push({
        x: MARGIN + CONTENT_W / 2,
        y: y + i * LINE_H,
        text: buyerLines[i],
        style: 'body',
      });
    }
  }
  sections.push({ name: 'parties', runs: parties, height: (partyRows + 1) * LINE_H });
  y += (partyRows + 1) * LINE_H + LINE_H;

  // ---- items table: fixed columns
  const col = {
    desc: MARGIN,
    qty: MARGIN + CONTENT_W * 0.5,
    unit: MARGIN + CONTENT_W * 0.62,
    disc: MARGIN + CONTENT_W * 0.74,
    tax: MARGIN + CONTENT_W * 0.86,
    amt: PAGE_WIDTH - MARGIN,
  };
  const items: TextRun[] = [
    { x: col.desc, y, text: 'Description', style: 'heading' },
    { x: col.qty, y, text: 'Qty', style: 'heading', align: 'right' },
    { x: col.unit, y, text: 'Unit', style: 'heading', align: 'right' },
    { x: col.disc, y, text: 'Disc.', style: 'heading', align: 'right' },
    { x: col.tax, y, text: 'Tax', style: 'heading', align: 'right' },
    { x: col.amt, y, text: 'Amount', style: 'heading', align: 'right' },
  ];
  y += LINE_H;
  for (const it of inv.items) {
    const gross = Math.round(it.quantity * it.unitPrice);
    const net = gross - (it.discount ?? 0);
    const taxAmt = Math.round((net * (it.taxBps ?? 0)) / 10_000);
    items.push({ x: col.desc, y, text: it.description, style: 'body' });
    items.push({ x: col.qty, y, text: String(it.quantity), style: 'mono', align: 'right' });
    items.push({ x: col.unit, y, text: money(it.unitPrice, inv.currency), style: 'mono', align: 'right' });
    items.push({
      x: col.disc,
      y,
      text: it.discount ? money(it.discount, inv.currency) : '—',
      style: 'mono',
      align: 'right',
    });
    items.push({
      x: col.tax,
      y,
      text: taxAmt ? money(taxAmt, inv.currency) : '—',
      style: 'mono',
      align: 'right',
    });
    items.push({ x: col.amt, y, text: money(net, inv.currency), style: 'mono', align: 'right' });
    y += LINE_H;
  }
  sections.push({ name: 'items', runs: items, height: (inv.items.length + 1) * LINE_H });
  y += LINE_H;

  // ---- totals: right-aligned column
  const totRuns: TextRun[] = [];
  const totalRow = (label: string, value: Money, strong = false): void => {
    totRuns.push({ x: col.qty, y, text: label, style: strong ? 'heading' : 'body', align: 'right' });
    totRuns.push({
      x: PAGE_WIDTH - MARGIN,
      y,
      text: money(value, inv.currency),
      style: strong ? 'heading' : 'mono',
      align: 'right',
    });
    y += LINE_H;
  };
  totalRow('Subtotal', totals.subtotal);
  if (totals.lineDiscounts > 0) totalRow('Line discounts', -totals.lineDiscounts);
  if (totals.invoiceDiscount > 0) totalRow('Discount', -totals.invoiceDiscount);
  if (totals.tax > 0) totalRow('Tax', totals.tax);
  totalRow('Total due', totals.total, true);
  sections.push({ name: 'totals', runs: totRuns, height: totRuns.length * LINE_H });
  y += LINE_H;

  // ---- footer
  const footer: TextRun[] = (inv.notes ?? []).map((n) => ({
    x: MARGIN,
    y: (() => {
      const yy = y;
      y += LINE_H;
      return yy;
    })(),
    text: n,
    style: 'muted',
  }));
  sections.push({ name: 'footer', runs: footer, height: (inv.notes?.length ?? 0) * LINE_H });

  return { width: PAGE_WIDTH, height: y + MARGIN, sections, totals };
}

/** Render the layout to plain structured text (test/debug output). */
export function renderText(doc: LayoutDocument): string {
  const lines: string[] = [];
  for (const s of doc.sections) {
    lines.push(`=== ${s.name.toUpperCase()} ===`);
    // Group runs by row (y) then emit left→right.
    const rows = new Map<number, TextRun[]>();
    for (const r of s.runs) {
      const arr = rows.get(r.y) ?? [];
      arr.push(r);
      rows.set(r.y, arr);
    }
    for (const [y, runs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const row = runs
        .sort((a, b) => a.x - b.x)
        .map((r) => (r.align === 'right' ? `>${r.text}<` : r.text))
        .join('  |  ');
      lines.push(`  ${row}`);
    }
  }
  return lines.join('\n');
}
