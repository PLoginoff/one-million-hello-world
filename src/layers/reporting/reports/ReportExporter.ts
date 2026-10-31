/**
 * Report Exporter
 *
 * Serializes a {@link ReportResult} to CSV or JSON.
 *
 * CSV rules (RFC 4180):
 *   - fields containing `,` `"` `\n` `\r` are wrapped in double quotes
 *   - embedded `"` is escaped by doubling (`""`)
 *   - Dates → ISO 8601, null → empty field
 *   - header row uses column labels when the dataset spec provides them
 *
 * JSON: `{ columns, rows: [{col: value,…}], generatedAt }` with Dates as
 * ISO strings — machine-readable, round-trippable.
 *
 * @module ReportingLayer/Reports
 */

import { Cell, ReportResult } from './ReportTypes';

export type ExportFormat = 'csv' | 'json';

export class ReportExporter {
  /**
   * Export a result. Returns the serialized string.
   */
  export(result: ReportResult, format: ExportFormat): string {
    return format === 'csv' ? toCsv(result) : toJson(result);
  }

  toCsv(result: ReportResult): string {
    return toCsv(result);
  }

  toJson(result: ReportResult): string {
    return toJson(result);
  }
}

function toCsv(result: ReportResult): string {
  const lines: string[] = [];
  lines.push(result.columns.map(escapeCsv).join(','));
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => escapeCsv(cellText(row[c]))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function toJson(result: ReportResult): string {
  const rows = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const c of result.columns) {
      const v = row[c];
      obj[c] = v instanceof Date ? v.toISOString() : v;
    }
    return obj;
  });
  return JSON.stringify(
    { columns: result.columns, rows, generatedAt: new Date(result.generatedAt).toISOString() },
    null,
    2
  );
}
