/**
 * Pivot Table
 *
 * Transforms grouped rows into a row × column matrix with an aggregated
 * value per cell — the classic "cross-tab" report.
 *
 * Given rows grouped by `rowDimension` and `pivotColumn`, each distinct
 * pivot-column value becomes an output column; each cell contains
 * `value` aggregate over the matching subset.
 *
 * Example — sales by region (rows) × quarter (cols), summing revenue:
 *   rowDimension: 'region', pivotColumn: 'quarter', value: sum('revenue')
 *
 * @module ReportingLayer/Reports
 */

import {
  Aggregate,
  Cell,
  PivotSpec,
  ReportResult,
  Row,
} from './ReportTypes';
import { compareCells } from './QueryPipeline';

export class PivotTable {
  /**
   * Pivot `rows` according to `spec`. `rows` should already be filtered;
   * each input row is a raw record — the pivot groups internally.
   */
  build(rows: readonly Row[], spec: PivotSpec, generatedAt: number): ReportResult {
    // Collect distinct pivot values (sorted) → output column order.
    const pivotValues = new Map<string, Cell>();
    for (const r of rows) {
      const pv = r[spec.column];
      const key = cellKey(pv);
      if (!pivotValues.has(key)) pivotValues.set(key, pv);
    }
    const sortedPivots = Array.from(pivotValues.values()).sort(compareCells);
    const pivotIndex = new Map<string, number>();
    sortedPivots.forEach((v, i) => pivotIndex.set(cellKey(v), i));

    // Group rows by rowDimension.
    const byRow = new Map<string, { rowKey: Cell; rows: Row[] }>();
    for (const r of rows) {
      const rv = r[spec.rowDimension];
      const key = cellKey(rv);
      const g = byRow.get(key);
      if (g) g.rows.push(r);
      else byRow.set(key, { rowKey: rv, rows: [r] });
    }

    const columns = [spec.rowDimension, ...sortedPivots.map((v) => String(v))];
    const fill = spec.fill ?? 0;

    const out: Row[] = [];
    const sortedGroups = Array.from(byRow.values()).sort((a, b) =>
      compareCells(a.rowKey, b.rowKey)
    );
    for (const g of sortedGroups) {
      const outRow: Record<string, Cell> = { [spec.rowDimension]: g.rowKey };
      // Bucket this group's rows by pivot value.
      const buckets: Row[][] = sortedPivots.map(() => []);
      for (const r of g.rows) {
        const idx = pivotIndex.get(cellKey(r[spec.column]));
        if (idx !== undefined) buckets[idx].push(r);
      }
      sortedPivots.forEach((pv, i) => {
        outRow[String(pv)] =
          buckets[i].length === 0 ? fill : aggregate(buckets[i], spec.value);
      });
      out.push(outRow);
    }
    return { columns, rows: out, generatedAt };
  }
}

function cellKey(v: Cell): string {
  if (v === null) return ' null';
  if (v instanceof Date) return `d${v.getTime()}`;
  return `${typeof v}:${String(v)}`;
}

function aggregate(rows: readonly Row[], a: Aggregate): Cell {
  const vals = rows
    .map((r) => (a.column === null ? (1 as Cell) : r[a.column!]))
    .filter((v): v is Exclude<Cell, null> => v !== null);
  switch (a.fn) {
    case 'count': return vals.length;
    case 'countDistinct': return new Set(vals.map(cellKey)).size;
    case 'first': return vals[0] ?? null;
    case 'last': return vals[vals.length - 1] ?? null;
    case 'sum': return vals.reduce<number>((s, v) => s + num(v), 0);
    case 'avg': return vals.length === 0 ? null : vals.reduce<number>((s, v) => s + num(v), 0) / vals.length;
    case 'min': return vals.length === 0 ? null : vals.reduce((m, v) => (compareCells(v, m) < 0 ? v : m));
    case 'max': return vals.length === 0 ? null : vals.reduce((m, v) => (compareCells(v, m) > 0 ? v : m));
  }
}

function num(v: Cell): number {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  return 0;
}
