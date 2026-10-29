/**
 * Merge-On-Read Table & Record-Level Upserts
 *
 * Hudi/Iceberg-style record-level mutations on top of the transaction
 * log:
 *
 *  - Writes arrive as upsert/delete *deltas* keyed by record key. Each
 *    delta is committed as a new file version rather than rewriting
 *    base files — copy-on-write amortized to merge-on-read.
 *  - Reads merge base files + delta files by record key: newest commit
 *    wins; delete markers tombstone the key. Complexity O(base + delta).
 *  - `compact()` materializes the merged view as new base files,
 *    tombstones the deltas — restoring read cost to O(base).
 *  - Snapshot isolation: readers see the file set at their snapshot
 *    version, so a compaction mid-read can't corrupt results.
 *
 * Records are JSON rows (`Record<string, unknown>`); the record key is
 * one or more columns hashed via JSON.stringify.
 *
 * @module DataLake/Engine
 */

import { DeltaTable, LogAction } from './TransactionLog';
import { LakeObjectStore } from './ZoneManager';
import { LakeRow } from './ColumnarFileFormat';

/** A table record — free-form row with a declared key. */
export type LakeRecord = Record<string, unknown>;

/** Payload inside a delta file: upserts + deletes tagged by kind. */
interface DeltaPayload {
  kind: 'delta';
  commitVersion: number;
  upserts: LakeRecord[];
  deletes: string[]; // serialized keys
}

/** Payload inside a base file: full merged records. */
interface BasePayload {
  kind: 'base';
  records: LakeRecord[];
}

/** Options controlling the MOR table. */
export interface MorOptions {
  /** Columns forming the record key. */
  readonly keyColumns: readonly string[];
  /** Bytes threshold above which auto-compaction is suggested. */
  readonly compactWhenDeltaBytesExceed?: number;
}

/** Read options: as-of version for time travel. */
export interface ReadOptions {
  readonly asOfVersion?: number;
}

/**
 * Key for a record: JSON of the key column values — stable and cheap.
 */
export function recordKey(record: LakeRecord, keyColumns: readonly string[]): string {
  return JSON.stringify(keyColumns.map((c) => record[c] ?? null));
}

function encodePayload(p: DeltaPayload | BasePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

function decodePayload(data: Uint8Array): DeltaPayload | BasePayload {
  return JSON.parse(new TextDecoder().decode(data)) as DeltaPayload | BasePayload;
}

/**
 * Merge-on-read table.
 *
 * File roles are distinguished by a tag on the add action's
 * partitionValues `__filetype` slot ('base' | 'delta').
 */
export class MergeOnReadTable {
  readonly table: DeltaTable;
  private readonly _store: LakeObjectStore;
  private readonly _opts: Required<MorOptions>;
  private _fileSeq = 0;

  constructor(store: LakeObjectStore, tablePath: string, opts: MorOptions) {
    if (opts.keyColumns.length === 0) throw new Error('keyColumns required');
    this._store = store;
    this.table = new DeltaTable(store, tablePath);
    this._opts = {
      keyColumns: opts.keyColumns,
      compactWhenDeltaBytesExceed: opts.compactWhenDeltaBytesExceed ?? 64 * 1024 * 1024,
    };
  }

  /** Initialise the table log (call once). */
  initialise(schema: { name: string; type: 'int32' | 'int64' | 'float64' | 'boolean' | 'utf8'; nullable: boolean }[]): void {
    this.table.log.initialise(schema);
  }

  /**
   * Stage an upsert batch: a delta file containing the upserts plus
   * explicit key deletes. Committed as one version.
   */
  upsert(records: readonly LakeRecord[], deletes: readonly LakeRecord[] = []): number {
    const payload: DeltaPayload = {
      kind: 'delta',
      commitVersion: this.table.log.version + 1,
      upserts: [...records],
      deletes: deletes.map((d) => recordKey(d, this._opts.keyColumns)),
    };
    const name = `delta-${String(this._fileSeq++).padStart(6, '0')}.json`;
    return this.table.write(
      [
        {
          path: name,
          data: encodePayload(payload),
          partitionValues: { __filetype: 'delta' },
        },
      ],
      'append'
    );
  }

  /** Delete records by key (tombstone delta). */
  delete(keys: readonly LakeRecord[]): number {
    return this.upsert([], keys);
  }

  /**
   * Read the merged view.
   *
   * Merge order: base files first (any order — keys unique per write),
   * then deltas in commit-version order so the newest write wins per key.
   * Tombstones remove the key entirely. O(totalRecords).
   */
  read(opts: ReadOptions = {}): LakeRecord[] {
    const snap = opts.asOfVersion === undefined ? this.table.log.snapshot() : this.table.log.snapshotAt(opts.asOfVersion);
    // Collect payloads with their add-order; version comes from file
    // position in the snapshot, not stored per-file — we use the delta's
    // embedded commitVersion for ordering.
    const bases: LakeRecord[] = [];
    const deltas: DeltaPayload[] = [];
    for (const [path, add] of snap.files) {
      const obj = this._store.get(path);
      if (obj === undefined) continue;
      const payload = decodePayload(obj.data);
      const filetype = (add as Extract<LogAction, { type: 'add' }>).partitionValues.__filetype;
      if (payload.kind === 'base' || filetype === 'base') {
        bases.push(...(payload as BasePayload).records);
      } else {
        deltas.push(payload as DeltaPayload);
      }
    }
    deltas.sort((a, b) => a.commitVersion - b.commitVersion);

    const merged = new Map<string, LakeRecord>();
    for (const r of bases) merged.set(recordKey(r, this._opts.keyColumns), r);
    for (const d of deltas) {
      for (const k of d.deletes) merged.delete(k);
      for (const r of d.upserts) merged.set(recordKey(r, this._opts.keyColumns), r);
    }
    return [...merged.values()];
  }

  /**
   * Compact: fold all deltas into a fresh base file, tombstone the
   * inputs. Returns the new version.
   */
  compact(): number {
    const records = this.read();
    const snap = this.table.log.snapshot();
    const payload: BasePayload = { kind: 'base', records };
    const name = `base-${String(this._fileSeq++).padStart(6, '0')}.json`;
    // Remove all existing files + add the merged base — atomic swap.
    const actions: LogAction[] = [...snap.files.keys()].map((p) => ({ type: 'remove', path: p, deletionTimestamp: Date.now() }));
    const fullPath = `${this.table.log.tablePath}/${name}`;
    const data = encodePayload(payload);
    this._store.put({
      path: fullPath,
      zone: 'curated',
      data,
      contentType: 'application/json',
      tags: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sizeBytes: data.byteLength,
    });
    actions.push({ type: 'add', path: fullPath, sizeBytes: data.byteLength, partitionValues: { __filetype: 'base' } });
    return this.table.log.commit(snap.version, actions);
  }

  /** True when live delta bytes exceed the configured threshold. */
  needsCompaction(): boolean {
    const snap = this.table.log.snapshot();
    let deltaBytes = 0;
    for (const add of snap.files.values()) {
      const a = add as Extract<LogAction, { type: 'add' }>;
      if (a.partitionValues.__filetype === 'delta') deltaBytes += a.sizeBytes;
    }
    return deltaBytes > this._opts.compactWhenDeltaBytesExceed;
  }

  /** Current file-role breakdown. */
  fileStats(): { baseFiles: number; deltaFiles: number; deltaBytes: number } {
    const snap = this.table.log.snapshot();
    let base = 0;
    let delta = 0;
    let bytes = 0;
    for (const add of snap.files.values()) {
      const a = add as Extract<LogAction, { type: 'add' }>;
      if (a.partitionValues.__filetype === 'delta') {
        delta++;
        bytes += a.sizeBytes;
      } else {
        base++;
      }
    }
    return { baseFiles: base, deltaFiles: delta, deltaBytes: bytes };
  }

  /** Convenience: rows → LakeRow cast for file-format interop. */
  static toLakeRows(records: readonly LakeRecord[]): LakeRow[] {
    return records.map((r) => {
      const out: LakeRow = {};
      for (const [k, v] of Object.entries(r)) {
        if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          out[k] = v;
        } else {
          out[k] = JSON.stringify(v);
        }
      }
      return out;
    });
  }
}
