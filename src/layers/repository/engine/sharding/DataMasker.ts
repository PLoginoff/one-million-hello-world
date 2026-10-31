/**
 * DataMasker — field-level PII masking applied on read.
 *
 * Dynamic data masking (DDM): the underlying rows stay complete, but reads
 * through this layer rewrite sensitive fields according to per-field rules.
 * This is how SQL Server's DDM and BigQuery's column-level security work —
 * the data isn't encrypted at rest, it's transformed at the projection edge
 * based on WHO is asking.
 *
 * Mask kinds (deterministic — the same input always produces the same output,
 * so masked values remain JOIN-able and test-assertable):
 *
 *   redact   → fixed replacement string ("***")            — hides everything
 *   partial  → keep last `keepChars`, mask the rest        — "••••1234" (cards)
 *   hash     → deterministic FNV-1a hex                    — joins still work
 *   nullify  → replace with null                           — field "absent"
 *   year     → Date → Jan 1 of same year                   — age banding (HIPAA)
 *
 * Roles: rules apply per role. `mask(rows, 'analyst')` applies only the rules
 * visible to 'analyst'; the 'admin' role can be configured to see raw data.
 * This models column-privilege checks without a full RBAC engine.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { getPath } from '../path';
import { fnv1a } from './ShardRouter';
import { MaskKind, MaskRule } from './types';

export interface MaskPolicy {
  /** Field-path → mask rule. Paths are dot-separated (`address.ssn`). */
  readonly rules: readonly MaskRule[];
  /**
   * Roles that BYPASS masking entirely (see raw data). Default: none —
   * mask everything for everyone unless a role is granted.
   */
  readonly bypassRoles?: readonly string[];
  /** Role → subset of fields that stay masked even for that role. If a role
   *  is neither bypassed nor listed, all rules apply. */
  readonly roleExemptions?: Readonly<Record<string, readonly string[]>>;
  /** For 'partial' masks: how many trailing chars to keep. Default 4. */
  readonly keepChars?: number;
}

export class DataMasker {
  private readonly rulesByField = new Map<string, MaskKind>();
  private readonly bypass: Set<string>;
  private readonly exemptions: Map<string, Set<string>>;
  private readonly keepChars: number;

  constructor(private readonly policy: MaskPolicy) {
    this.bypass = new Set(policy.bypassRoles ?? []);
    this.keepChars = policy.keepChars ?? 4;
    this.exemptions = new Map(
      Object.entries(policy.roleExemptions ?? {}).map(([r, fields]) => [
        r,
        new Set(fields),
      ])
    );
    for (const r of policy.rules) this.rulesByField.set(r.field, r.mask);
  }

  /**
   * Masks a single row for `role`. Returns a new object — the source row is
   * never mutated (masked reads must not poison the store).
   */
  maskRow<T>(row: T, role = 'default'): T {
    if (this.bypass.has(role)) return row;
    if (row === null || typeof row !== 'object') return row;

    const exempt = this.exemptions.get(role);
    const clone = deepClone(row) as Record<string, unknown>;

    for (const [field, kind] of this.rulesByField) {
      if (exempt?.has(field)) continue; // role keeps this field unmasked
      const segs = field.split('.');
      applyMaskAtPath(clone, segs, kind, this.keepChars);
    }
    return clone as T;
  }

  /** Masks a list of rows (fan-out result or a plain scan). */
  maskRows<T>(rows: readonly T[], role = 'default'): T[] {
    if (this.bypass.has(role)) return rows as T[];
    return rows.map((r) => this.maskRow(r, role));
  }

  /** True when `role` sees field `f` masked under this policy. */
  isMasked(field: string, role = 'default'): boolean {
    if (this.bypass.has(role)) return false;
    if (!this.rulesByField.has(field)) return false;
    const exempt = this.exemptions.get(role);
    return !(exempt?.has(field) ?? false);
  }
}

// --------------------------------------------------------------------------
// Mask implementations — all pure, deterministic.
// --------------------------------------------------------------------------

function applyMaskAtPath(
  obj: Record<string, unknown>,
  segs: readonly string[],
  kind: MaskKind,
  keepChars: number
): void {
  if (segs.length === 0) return;
  const [head, ...rest] = segs;
  if (rest.length === 0) {
    if (!(head in obj)) return; // absent field: nothing to mask
    obj[head] = maskValue(obj[head], kind, keepChars);
    return;
  }
  const next = obj[head];
  if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
    applyMaskAtPath(next as Record<string, unknown>, rest, kind, keepChars);
  } else if (Array.isArray(next)) {
    // Mask inside array elements too (`contacts[].email`).
    for (const el of next) {
      if (el !== null && typeof el === 'object') {
        applyMaskAtPath(el as Record<string, unknown>, rest, kind, keepChars);
      }
    }
  }
}

function maskValue(v: unknown, kind: MaskKind, keepChars: number): unknown {
  if (v === null || v === undefined) return v;
  switch (kind) {
    case 'nullify':
      return null;
    case 'redact':
      return '***';
    case 'partial': {
      const s = String(v);
      if (s.length <= keepChars) return '•'.repeat(Math.max(1, s.length - 1)) + s.slice(-1);
      return '•'.repeat(s.length - keepChars) + s.slice(-keepChars);
    }
    case 'hash': {
      // Deterministic FNV-1a hex — equal inputs produce equal outputs so
      // masked foreign keys still join and tests can assert on the value.
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `h:${fnv1a(s).toString(16).padStart(8, '0')}`;
    }
    case 'year': {
      if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), 0, 1));
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return v; // not a date: leave alone
      return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    }
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return v;
    }
  }
}

function deepClone(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(deepClone);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = deepClone(val);
  }
  return out;
}
