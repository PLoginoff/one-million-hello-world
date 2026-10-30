/**
 * ReadCommitted — read-committed isolation semantics stub.
 *
 * READ COMMITTED's contract: a read sees only committed data, but two
 * reads in the same transaction may see different values if another
 * transaction committed between them (non-repeatable reads are allowed).
 *
 * Model: a store of committed versions. Each `CommittedStore.commit`
 * publishes a new committed version of an entity. `begin()` captures a
 * *read timestamp*; `read` returns the newest committed version —
 * re-reading returns newer data if another tx committed meanwhile
 * (non-repeatable read is legal under RC).
 *
 * Also models the write side: a transaction buffers writes; `commit`
 * publishes them atomically (all writes become visible at one commit
 * instant — the atomicity half of RC). Reads never see buffered writes:
 * no dirty reads, that's the hard guarantee.
 *
 * `PhantomWrite` guard: `commit` checks that no entity the tx read was
 * re-committed by another writer after the tx began unless
 * `allowWriteSkew` — a cheap write-conflict check on top of RC (real
 * RC allows write skew; we surface it because application code usually
 * wants to know).
 *
 * @module UnitOfWorkLayer/Engine2
 */

export interface CommittedStore {
  /** Latest committed state per entity id. */
  get(entityId: string): Record<string, unknown> | null;
  /** Commit version (increments per write). */
  versionOf(entityId: string): number;
}

export class InMemoryCommittedStore implements CommittedStore {
  private readonly _data = new Map<string, { state: Record<string, unknown>; version: number }>();

  get(entityId: string): Record<string, unknown> | null {
    const e = this._data.get(entityId);
    return e ? JSON.parse(JSON.stringify(e.state)) : null;
  }

  versionOf(entityId: string): number {
    return this._data.get(entityId)?.version ?? 0;
  }

  /** Publish committed state (called by ReadCommittedTx.commit). */
  publish(entityId: string, state: Record<string, unknown>): void {
    const e = this._data.get(entityId);
    this._data.set(entityId, { state, version: (e?.version ?? 0) + 1 });
  }
}

export interface WriteConflict {
  readonly entityId: string;
  readonly readVersion: number;
  readonly currentVersion: number;
}

export class WriteSkewError extends Error {
  constructor(public readonly conflicts: readonly WriteConflict[]) {
    super(`write skew: ${conflicts.length} entit(ies) re-committed since read`);
    this.name = 'WriteSkewError';
  }
}

export class ReadCommittedTx {
  private readonly _store: InMemoryCommittedStore;
  private readonly _writes = new Map<string, Record<string, unknown>>();
  private readonly _readVersions = new Map<string, number>();
  private _open = true;

  constructor(store: InMemoryCommittedStore, private readonly allowWriteSkew = false) {
    this._store = store;
  }

  /**
   * Read — returns the NEWEST committed version (RC semantics:
   * non-repeatable reads allowed). Buffered writes from this tx are NOT
   * visible even to itself unless read-your-writes is layered on top —
   * callers wanting that overlay `readOwn()`.
   */
  read(entityId: string): Record<string, unknown> | null {
    if (!this._open) throw new Error('transaction closed');
    this._readVersions.set(entityId, this._store.versionOf(entityId));
    return this._store.get(entityId);
  }

  /** Read with own buffered writes overlaid (read-your-writes). */
  readOwn(entityId: string): Record<string, unknown> | null {
    const w = this._writes.get(entityId);
    return w ? JSON.parse(JSON.stringify(w)) : this.read(entityId);
  }

  /** Buffer a write — invisible to all reads until commit. */
  write(entityId: string, state: Record<string, unknown>): void {
    if (!this._open) throw new Error('transaction closed');
    this._writes.set(keyOf(entityId), JSON.parse(JSON.stringify(state)));
  }

  /**
   * Commit — publishes all buffered writes atomically. Throws
   * WriteSkewError when an entity this tx read was re-committed after
   * the tx first read it (unless allowWriteSkew).
   */
  commit(): void {
    if (!this._open) throw new Error('transaction closed');
    const conflicts: WriteConflict[] = [];
    if (!this.allowWriteSkew) {
      for (const [id, readVer] of this._readVersions) {
        const cur = this._store.versionOf(id);
        if (cur !== readVer && this._writes.has(id)) {
          conflicts.push({ entityId: id, readVersion: readVer, currentVersion: cur });
        }
      }
    }
    if (conflicts.length) throw new WriteSkewError(conflicts);
    for (const [id, state] of this._writes) this._store.publish(id, state);
    this._writes.clear();
    this._open = false;
  }

  rollback(): void {
    this._writes.clear();
    this._open = false;
  }

  get isOpen(): boolean {
    return this._open;
  }
}

function keyOf(s: string): string {
  return s;
}
