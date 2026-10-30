/**
 * Tamper-Evident Hash Chain
 *
 * Implements the cryptographic core of the audit pipeline:
 *
 *   hash_n = SHA256( canonicalJson(fields_n) + "|" + previousHash )
 *
 * where `previousHash` for the first record is the genesis constant
 * (SHA256 of the empty string, a well-known value).
 *
 * Canonical serialization sorts object keys recursively so the hash
 * is stable regardless of key insertion order — critical for
 * verification against independently produced records.
 *
 * Appending a record: O(size of details).
 * Verifying a chain of N records: O(total size).
 *
 * @module AuditLayer/Engine
 */

import { createHash } from 'crypto';
import { AuditRecord, AuditEventInput, RetentionTierName } from './types';

/**
 * SHA256("") — the well-known genesis previous-hash. Using a public
 * constant lets verifiers anchor the chain without configuration.
 */
export const GENESIS_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Deterministic JSON: object keys are sorted recursively; `undefined`
 * fields are dropped (as JSON.stringify does); arrays keep order.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]));
  return '{' + parts.join(',') + '}';
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Fields covered by the chain hash (everything but hash itself). */
function coveredFields(r: Omit<AuditRecord, 'hash'>): Record<string, unknown> {
  return {
    seq: r.seq,
    id: r.id,
    timestamp: r.timestamp,
    actor: r.actor,
    action: r.action,
    resource: r.resource,
    resourceType: r.resourceType,
    outcome: r.outcome,
    severity: r.severity,
    details: r.details,
    sourceIp: r.sourceIp,
    correlationId: r.correlationId,
    tenant: r.tenant,
    previousHash: r.previousHash,
    tier: r.tier,
  };
}

/**
 * Compute the chain hash for a record-without-hash.
 */
export function computeRecordHash(record: Omit<AuditRecord, 'hash'>): string {
  return sha256Hex(canonicalJson(coveredFields(record)) + '|' + record.previousHash);
}

/**
 * Seal an event input into a full audit record.
 *
 * `seq` and `previousHash` chain this record onto the tip. The result
 * is treated as immutable — callers must not mutate it.
 */
export function sealRecord(
  input: AuditEventInput,
  opts: {
    seq: number;
    id: string;
    previousHash: string;
    timestamp: number;
    tier: RetentionTierName;
  }
): AuditRecord {
  const base: Omit<AuditRecord, 'hash'> = {
    seq: opts.seq,
    id: opts.id,
    timestamp: input.timestamp ?? opts.timestamp,
    actor: input.actor,
    action: input.action,
    resource: input.resource,
    resourceType: input.resourceType,
    outcome: input.outcome ?? 'success',
    severity: input.severity ?? 'info',
    details: input.details ?? {},
    sourceIp: input.sourceIp,
    correlationId: input.correlationId,
    tenant: input.tenant,
    previousHash: opts.previousHash,
    tier: opts.tier,
  };
  return { ...base, hash: computeRecordHash(base) };
}

/** Per-record check: recompute the hash, compare. */
export function verifyRecord(record: AuditRecord): boolean {
  const { hash, ...rest } = record;
  return computeRecordHash(rest) === hash;
}

/**
 * Verify an ordered sequence of records forms a valid chain:
 *  - record 1 must point at GENESIS_HASH
 *  - each record's previousHash must equal the prior record's hash
 *  - each record's hash must recompute correctly
 *
 * Returns the index (0-based) of the first bad record or -1.
 */
export function verifyChain(records: readonly AuditRecord[]): {
  ok: boolean;
  firstBadIndex: number;
  tipHash: string;
} {
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (r.previousHash !== expectedPrev) {
      return { ok: false, firstBadIndex: i, tipHash: expectedPrev };
    }
    if (!verifyRecord(r)) {
      return { ok: false, firstBadIndex: i, tipHash: r.hash };
    }
    expectedPrev = r.hash;
  }
  return { ok: true, firstBadIndex: -1, tipHash: expectedPrev };
}
