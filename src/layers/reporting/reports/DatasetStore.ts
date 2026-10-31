/**
 * Dataset Store
 *
 * Named in-memory datasets with typed column validation. Rows are
 * validated against the dataset's {@link ColumnSpec}s on insert:
 * type-checked, missing columns default to null, unknown columns rejected.
 *
 * @module ReportingLayer/Reports
 */

import {
  Cell,
  ColumnSpec,
  ColumnType,
  Dataset,
  ReportError,
  Row,
} from './ReportTypes';

export class DatasetStore {
  private readonly _datasets = new Map<string, Dataset>();

  /** Register a dataset (schema only — rows appended via {@link insert}). */
  define(name: string, columns: readonly ColumnSpec[]): Dataset {
    if (this._datasets.has(name)) {
      throw new ReportError('INVALID_QUERY', `dataset '${name}' already defined`);
    }
    const ds: Dataset = { name, columns, rows: [] };
    this._datasets.set(name, ds);
    return ds;
  }

  get(name: string): Dataset | null {
    return this._datasets.get(name) ?? null;
  }

  getOrThrow(name: string): Dataset {
    const d = this.get(name);
    if (!d) throw new ReportError('DATASET_NOT_FOUND', `dataset '${name}' not found`);
    return d;
  }

  drop(name: string): boolean {
    return this._datasets.delete(name);
  }

  /**
   * Append a row after type-checking each cell against the column spec.
   * Missing keys → null; extra keys → COLUMN_NOT_FOUND.
   */
  insert(datasetName: string, row: Row): void {
    const ds = this.getOrThrow(datasetName);
    const spec = new Map(ds.columns.map((c) => [c.name, c]));
    for (const key of Object.keys(row)) {
      if (!spec.has(key)) {
        throw new ReportError('COLUMN_NOT_FOUND', `unknown column '${key}' in '${datasetName}'`);
      }
    }
    const normalized: Record<string, Cell> = {};
    for (const col of ds.columns) {
      const v = row[col.name];
      normalized[col.name] = v === undefined ? null : checkType(datasetName, col, v);
    }
    ds.rows.push(normalized);
  }

  insertAll(datasetName: string, rows: readonly Row[]): void {
    for (const r of rows) this.insert(datasetName, r);
  }

  /** Column spec lookup for the pipeline. */
  column(datasetName: string, columnName: string): ColumnSpec {
    const ds = this.getOrThrow(datasetName);
    const c = ds.columns.find((x) => x.name === columnName);
    if (!c) {
      throw new ReportError('COLUMN_NOT_FOUND', `no column '${columnName}' in '${datasetName}'`);
    }
    return c;
  }

  get datasetNames(): readonly string[] {
    return Array.from(this._datasets.keys());
  }
}

function checkType(dataset: string, col: ColumnSpec, v: Cell): Cell {
  if (v === null) return null;
  const ok =
    (col.type === 'string' && typeof v === 'string') ||
    (col.type === 'number' && typeof v === 'number') ||
    (col.type === 'boolean' && typeof v === 'boolean') ||
    (col.type === 'date' && v instanceof Date);
  if (!ok) {
    throw new ReportError(
      'TYPE_MISMATCH',
      `column '${col.name}' in '${dataset}' expects ${col.type}, got ${typeof v}`
    );
  }
  return v;
}
