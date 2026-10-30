/**
 * Audit Exporter
 *
 * Serializes audit records into interoperable formats:
 *
 *  - `cef`    ArcSight Common Event Format (v0) structured lines
 *  - `jsonl`  one canonical JSON record per line
 *  - `csv`    flat comma-separated fields with escaping
 *
 * CEF line shape:
 *   CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
 *
 * Extension keys used: suser, act, outcome, src, cs1 (resource),
 * cs2 (tenant), cs3 (correlationId), rt, end, externalId, and the
 * record hash fields cs4 (hash) / cs5 (previousHash) for forensics.
 *
 * @module AuditLayer/Engine
 */

import { AuditRecord, AuditSeverity } from './types';

export type AuditExportFormat = 'cef' | 'jsonl' | 'csv';

const SEVERITY_TO_CEF: Record<AuditSeverity, number> = {
  debug: 1,
  info: 3,
  notice: 4,
  warning: 6,
  error: 8,
  critical: 10,
};

const OUTCOME_TO_CEF: Record<AuditRecord['outcome'], string> = {
  success: 'success',
  failure: 'failure',
  denied: 'failure',
};

/** Escape CEF header/extension values. */
function cefEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function cefExtEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Detail values must serialize deterministically for CEF cs6. */
function detailsToString(details: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    parts.push(`${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(' ');
}

/**
 * Format one record as a CEF line.
 */
export function toCefLine(r: AuditRecord): string {
  const ext: string[] = [
    `suser=${cefExtEscape(r.actor)}`,
    `act=${cefExtEscape(r.action)}`,
    `outcome=${OUTCOME_TO_CEF[r.outcome]}`,
    `rt=${r.timestamp}`,
    `end=${r.timestamp}`,
    `externalId=${cefExtEscape(r.id)}`,
    `cs4=${r.hash}`,
    `cs4Label=recordHash`,
    `cs5=${r.previousHash}`,
    `cs5Label=previousHash`,
  ];
  if (r.sourceIp) ext.push(`src=${cefExtEscape(r.sourceIp)}`);
  if (r.resource) ext.push(`cs1=${cefExtEscape(r.resource)}`, 'cs1Label=resource');
  if (r.tenant) ext.push(`cs2=${cefExtEscape(r.tenant)}`, 'cs2Label=tenant');
  if (r.correlationId) ext.push(`cs3=${cefExtEscape(r.correlationId)}`, 'cs3Label=correlationId');
  const d = detailsToString(r.details);
  if (d) ext.push(`cs6=${cefExtEscape(d)}`, 'cs6Label=details');

  const signatureId = `${r.action}:${r.outcome}`;
  return (
    `CEF:0|OMHW|AuditLayer|1.0|${cefEscape(signatureId)}|` +
    `${cefEscape(r.action)}|${SEVERITY_TO_CEF[r.severity]}|${ext.join(' ')}`
  );
}

/** CSV header matching `toCsvLine`. */
export const AUDIT_CSV_HEADER =
  'seq,id,timestamp,actor,action,resource,resourceType,outcome,severity,tenant,correlationId,sourceIp,hash,previousHash,details';

/** Format one record as CSV. */
export function toCsvLine(r: AuditRecord): string {
  const cols = [
    String(r.seq),
    r.id,
    new Date(r.timestamp).toISOString(),
    r.actor,
    r.action,
    r.resource ?? '',
    r.resourceType ?? '',
    r.outcome,
    r.severity,
    r.tenant ?? '',
    r.correlationId ?? '',
    r.sourceIp ?? '',
    r.hash,
    r.previousHash,
    JSON.stringify(r.details),
  ];
  return cols.map(csvEscape).join(',');
}

/** Format one record as canonical JSON (single line). */
export function toJsonLine(r: AuditRecord): string {
  return JSON.stringify(r);
}

/**
 * Export a set of records.
 */
export function exportRecords(
  records: readonly AuditRecord[],
  format: AuditExportFormat
): string {
  switch (format) {
    case 'cef':
      return records.map(toCefLine).join('\n') + (records.length > 0 ? '\n' : '');
    case 'jsonl':
      return records.map(toJsonLine).join('\n') + (records.length > 0 ? '\n' : '');
    case 'csv': {
      const lines = [AUDIT_CSV_HEADER, ...records.map(toCsvLine)];
      return lines.join('\n') + '\n';
    }
  }
}

/** MIME type suggestion for a format. */
export function contentTypeFor(format: AuditExportFormat): string {
  switch (format) {
    case 'cef':
      return 'text/plain; charset=utf-8';
    case 'jsonl':
      return 'application/x-ndjson';
    case 'csv':
      return 'text/csv; charset=utf-8';
  }
}
