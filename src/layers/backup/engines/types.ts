/**
 * Backup Engine Types
 *
 * Shared types for the backup engines: policies, block-level backup
 * execution, the restore-point catalog, restore planning, integrity
 * verification, AES-GCM encryption, and retention pruning.
 *
 * Storage model: a "source" is a set of named objects (files, volumes),
 * each a sequence of fixed-size blocks. Blocks are content-addressed by
 * SHA-256 so unchanged blocks are never stored twice — the same
 * deduplication trick restic/Borg use.
 *
 * @module BackupLayer/Engines
 */

import { createHash } from 'crypto';

/** Injectable clock for schedules, retention, and point-in-time restore. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _current: number;
  constructor(start: number = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

/** SHA-256 hex digest of a buffer — the block content address. */
export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export enum BackupKind {
  Full = 'full',
  Incremental = 'incremental',
}

/**
 * Cron-lite schedule: interval in ms between runs of each kind.
 * A real system would parse cron; an interval is sufficient here because
 * "is it due?" is the only question the engine answers.
 */
export interface BackupPolicy {
  id: string;
  name: string;
  /** Source identifiers this policy protects. */
  scope: string[];
  /** ms between full backups. */
  fullIntervalMs: number;
  /** ms between incremental backups. */
  incrementalIntervalMs: number;
  /** Retention rule applied by the pruning engine. */
  retention: RetentionRule;
  /** Whether backups under this policy must be encrypted. */
  requireEncryption: boolean;
}

export interface RetentionRule {
  /** Keep at most this many restore points per source. */
  maxCount: number | null;
  /** Keep restore points younger than this (ms). Null = no age limit. */
  maxAgeMs: number | null;
  /** Never prune a restore point pinned by a caller (e.g. legal). */
  respectPins: boolean;
}

// ---------------------------------------------------------------------------
// Blocks & objects
// ---------------------------------------------------------------------------

/** One block of backed-up data, content-addressed. */
export interface StoredBlock {
  hash: string;
  /** Ciphertext when encrypted, plaintext otherwise. */
  data: Buffer;
  size: number;
  encrypted: boolean;
  /** AES-GCM nonce; null when unencrypted. */
  nonce: Buffer | null;
  /** AES-GCM auth tag; null when unencrypted. */
  authTag: Buffer | null;
}

/** Per-object manifest entry inside a backup. */
export interface ObjectManifest {
  /** Object name (path, volume id, …). */
  name: string;
  /** Ordered block hashes — reassemble in order to restore. */
  blockHashes: string[];
  /** Plaintext byte length of the object. */
  size: number;
  /** SHA-256 of the whole plaintext object. */
  checksum: string;
}

// ---------------------------------------------------------------------------
// Restore points
// ---------------------------------------------------------------------------

export interface RestorePoint {
  id: string;
  policyId: string;
  sourceId: string;
  kind: BackupKind;
  createdAt: number;
  /** Parent restore point this incremental is based on; null for fulls. */
  parentId: string | null;
  /** All objects captured in this restore point. */
  objects: ObjectManifest[];
  /** Block hashes this restore point *introduced* (for accounting). */
  newBlockHashes: string[];
  /** SHA-256 over the canonical manifest — tamper evidence. */
  manifestChecksum: string;
  encrypted: boolean;
  pinned: boolean;
}

/**
 * Source data supplied to the engine: object name → content.
 * Buffers are split into `blockSize` chunks by the executor.
 */
export type SourceSnapshot = ReadonlyMap<string, Buffer>;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface CatalogQuery {
  sourceId?: string;
  policyId?: string;
  kind?: BackupKind;
  /** Restore points created at-or-after. */
  sinceMs?: number;
  /** Restore points created at-or-before. */
  untilMs?: number;
  /** Restore points containing an object with this exact name. */
  objectName?: string;
}

// ---------------------------------------------------------------------------
// Restore planning & integrity
// ---------------------------------------------------------------------------

export interface RestoreStep {
  restorePointId: string;
  kind: BackupKind;
  createdAt: number;
  /** Objects this step contributes to the final state. */
  objects: string[];
}

export interface RestorePlan {
  sourceId: string;
  targetTimeMs: number;
  /** Ordered steps: full first, then incrementals oldest→newest. */
  steps: RestoreStep[];
  /** Union of all object names restorable at targetTime. */
  restorableObjects: string[];
}

export interface IntegrityReport {
  restorePointId: string;
  ok: boolean;
  /** Blocks whose stored checksum matches their content. */
  verifiedBlocks: number;
  /** Blocks referenced but missing from the store. */
  missingBlocks: string[];
  /** Blocks whose hash does not match their stored bytes. */
  corruptBlocks: string[];
  /** Manifest checksum mismatch (tamper evidence). */
  manifestTampered: boolean;
}
