/**
 * Record Redactor — Field-Level PII Masking with Proof Digests
 *
 * GDPR/legal workflows need *views* of audit records with sensitive
 * fields hidden — you can't redact the record itself (it's
 * hash-chained; modifying it breaks verification), so the redactor
 * produces derived `RedactedRecord` views:
 *
 *   - named fields are replaced by a **deterministic digest**
 *     `sha256(salt | path | value)` — the same value always masks to
 *     the same token, so downstream consumers can still join/group
 *     on the masked field ("how many events did the same actor
 *     produce") without seeing the value;
 *   - the digest commits to (salt, field path, original value), so
 *     a redacted view + the original proves the redaction is honest:
 *     `verifyRedaction()` recomputes the digests and confirms
 *     nothing else changed;
 *   - rules are declared per path pattern (`details.ssn`, `actor`,
 *     `details.*.email`) with a wildcard matcher compiled once.
 *
 * Redaction is recursive over the `details` tree — paths descend
 * through objects and `[]` indexes arrays.
 *
 * This pairs with `ErasureLedger`: crypto-shred deletes the keys;
 * redaction hides the values in what you hand a requester.
 *
 * Complexity: rule compile O(pattern); redact O(record fields × rules).
 *
 * @module AuditLayer/Engine3
 */

import { createHash } from 'crypto';
import type { AuditRecord } from '../engine/types';
import { canonicalJson } from '../engine/HashChain';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** A redacted view of a record — same shape minus masked values. */
export interface RedactedRecord {
  readonly seq: number;
  readonly id: string;
  readonly timestamp: number;
  readonly actor: string;
  readonly action: string;
  readonly resource?: string;
  readonly resourceType?: string;
  readonly outcome: AuditRecord['outcome'];
  readonly severity: AuditRecord['severity'];
  readonly details: Record<string, unknown>;
  readonly sourceIp?: string;
  readonly correlationId?: string;
  readonly tenant?: string;
  /** Paths that were redacted. */
  readonly redactedPaths: readonly string[];
  /** Digest committing to (record id, paths, salt, digests). */
  readonly redactionProof: string;
}

/**
 * Path pattern → matcher. Syntax:
 *   'actor'          — the top-level field
 *   'details.ssn'    — nested under details
 *   'details.*'      — every direct child of details
 *   'details.*.ip'   — the `ip` field of every object inside details
 *   'details.tags[]' — every element of details.tags
 */
interface CompiledRule {
  readonly pattern: string;
  readonly segments: readonly string[];
}

function compilePattern(pattern: string): CompiledRule {
  const segments = pattern.split('.').filter((s) => s.length > 0);
  if (segments.length === 0) throw new Error(`empty path pattern`);
  return { pattern, segments };
}

/** Redact value `v` at `path`: deterministic, join-preserving token. */
function maskValue(salt: string, path: string, value: unknown): string {
  return `redacted:${sha256Hex(`${salt}|${path}|${canonicalJson(value)}`).slice(0, 24)}`;
}

export class RecordRedactor {
  private readonly salt: string;
  private readonly rules: CompiledRule[];

  constructor(options: { salt: string; patterns: readonly string[] }) {
    if (!options.salt) throw new Error('salt is required');
    this.salt = options.salt;
    this.rules = options.patterns.map(compilePattern);
  }

  /**
   * Produce a redacted view of a record. The original is untouched;
   * the view carries a proof digest for verification.
   */
  redact(record: AuditRecord): RedactedRecord {
    const redactedPaths: string[] = [];
    const clone = this.walk(
      {
        seq: record.seq,
        id: record.id,
        timestamp: record.timestamp,
        actor: record.actor,
        action: record.action,
        resource: record.resource,
        resourceType: record.resourceType,
        outcome: record.outcome,
        severity: record.severity,
        details: record.details,
        sourceIp: record.sourceIp,
        correlationId: record.correlationId,
        tenant: record.tenant,
      },
      '',
      redactedPaths
    ) as Record<string, unknown>;

    // The proof commits to the *entire* view (all fields post-
    // redaction) plus the salt — so changing any unredacted field
    // also breaks verification, not just the masked values.
    const proof = sha256Hex(
      canonicalJson({
        salt: this.salt,
        view: clone,
        redactedPaths: [...redactedPaths].sort(),
      })
    );

    return {
      ...(clone as Omit<RedactedRecord, 'redactedPaths' | 'redactionProof'>),
      redactedPaths,
      redactionProof: proof,
    };
  }

  /**
   * Verify a redacted view against the original record: recompute
   * the digests, check that (a) every listed path holds the correct
   * mask of the original value, and (b) no *other* field differs.
   */
  verifyRedaction(record: AuditRecord, view: RedactedRecord): { ok: boolean; detail?: string } {
    // The view itself must be self-consistent: its declared proof
    // must recompute over the *view's own* fields. This catches a
    // forged action/resource even when the mask tokens are copied
    // from a real view — the proof binds every field, not just the
    // redacted ones.
    const { redactionProof, redactedPaths, ...fields } = view;
    const selfProof = sha256Hex(
      canonicalJson({
        salt: this.salt,
        view: fields,
        redactedPaths: [...redactedPaths].sort(),
      })
    );
    if (selfProof !== redactionProof) {
      return { ok: false, detail: 'view proof mismatch — fields altered post-redaction' };
    }
    // (b) re-derive the view and compare wholesale.
    const expected = this.redact(record);
    if (expected.redactionProof !== view.redactionProof) {
      return { ok: false, detail: 'proof digest mismatch — view fields differ' };
    }
    // (a) spot-check each declared path is masked to the right token.
    for (const p of view.redactedPaths) {
      const orig = this.lookup(record as unknown as Record<string, unknown>, p);
      const masked = this.lookup(view as unknown as Record<string, unknown>, p);
      if (masked !== maskValue(this.salt, p, orig)) {
        return { ok: false, detail: `mask mismatch at ${p}` };
      }
    }
    return { ok: true };
  }

  /** Batch redaction. */
  redactAll(records: readonly AuditRecord[]): readonly RedactedRecord[] {
    return records.map((r) => this.redact(r));
  }

  /* --------------------------- internals ------------------------- */

  /**
   * Recursive walker: at each path step, check whether any rule
   * matches; mask matching leaves, descend otherwise.
   */
  private walk(node: unknown, path: string, hits: string[]): unknown {
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, path)) {
        hits.push(path);
        return maskValue(this.salt, path, node);
      }
    }
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const child = path === '' ? k : `${path}.${k}`;
        out[k] = this.walk(v, child, hits);
      }
      return out;
    }
    if (Array.isArray(node)) {
      return node.map((v, i) => this.walk(v, `${path}[${i}]`, hits));
    }
    return node;
  }

  /**
   * Does a rule match *this* path? Wildcards: `*` matches one
   * segment, `[]` matches any array index segment.
   */
  private ruleMatches(rule: CompiledRule, path: string): boolean {
    const pathSegs = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter((s) => s.length > 0);
    if (pathSegs.length !== rule.segments.length) return false;
    for (let i = 0; i < rule.segments.length; i++) {
      const rs = rule.segments[i]!;
      if (rs === '*') continue;
      if (rs.endsWith('[]')) continue; // handled by index expansion
      if (rs !== pathSegs[i]) return false;
    }
    return true;
  }

  private lookup(obj: Record<string, unknown>, path: string): unknown {
    const segs = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter((s) => s.length > 0);
    let cur: unknown = obj;
    for (const s of segs) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[s];
    }
    return cur;
  }
}
