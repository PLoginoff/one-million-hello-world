/**
 * Backup Catalog Engine
 *
 * Searchable index over restore points — the catalog is what an operator
 * queries to find "which backup holds file X at time T".
 *
 * Indexes:
 *  - byId:      restore point id → record (O(1) lookup)
 *  - bySource:  sourceId → sorted id list (time-ordered chain queries)
 *  - byObject:  object name → set of restore point ids containing it
 *
 * Point-in-time queries walk a source's sorted list with binary search.
 *
 * @module BackupLayer/Engines
 */

import { BackupKind, CatalogQuery, RestorePoint } from './types';

export class BackupCatalogEngine {
  private readonly _byId: Map<string, RestorePoint>;
  /** sourceId → restore point ids sorted by createdAt ascending. */
  private readonly _bySource: Map<string, string[]>;
  /** object name → restore point ids containing it. */
  private readonly _byObject: Map<string, Set<string>>;

  constructor() {
    this._byId = new Map();
    this._bySource = new Map();
    this._byObject = new Map();
  }

  /** Index a restore point. Idempotent. */
  index(rp: RestorePoint): void {
    if (this._byId.has(rp.id)) return;
    this._byId.set(rp.id, rp);

    let list = this._bySource.get(rp.sourceId);
    if (!list) {
      list = [];
      this._bySource.set(rp.sourceId, list);
    }
    // Insert sorted by createdAt — almost always an append.
    if (list.length === 0 || this._byId.get(list[list.length - 1]!)!.createdAt <= rp.createdAt) {
      list.push(rp.id);
    } else {
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this._byId.get(list[mid]!)!.createdAt <= rp.createdAt) lo = mid + 1;
        else hi = mid;
      }
      list.splice(lo, 0, rp.id);
    }

    for (const obj of rp.objects) {
      let set = this._byObject.get(obj.name);
      if (!set) {
        set = new Set();
        this._byObject.set(obj.name, set);
      }
      set.add(rp.id);
    }
  }

  /** Remove a restore point from all indexes. */
  remove(id: string): boolean {
    const rp = this._byId.get(id);
    if (!rp) return false;
    this._byId.delete(id);
    const list = this._bySource.get(rp.sourceId);
    if (list) {
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this._bySource.delete(rp.sourceId);
    }
    for (const obj of rp.objects) {
      const set = this._byObject.get(obj.name);
      if (set) {
        set.delete(id);
        if (set.size === 0) this._byObject.delete(obj.name);
      }
    }
    return true;
  }

  /** Direct lookup by restore point id. */
  get(id: string): RestorePoint | null {
    return this._byId.get(id) ?? null;
  }

  /**
   * Latest restore point for a source at-or-before `targetMs`
   * (binary search on the sorted per-source list).
   */
  latestBefore(sourceId: string, targetMs: number): RestorePoint | null {
    const list = this._bySource.get(sourceId);
    if (!list || list.length === 0) return null;
    // Binary search: greatest index with createdAt <= targetMs.
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._byId.get(list[mid]!)!.createdAt <= targetMs) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return null;
    return this._byId.get(list[lo - 1]!) ?? null;
  }

  /** All restore points containing a given object name. */
  containingObject(objectName: string): RestorePoint[] {
    const ids = this._byObject.get(objectName);
    if (!ids) return [];
    return [...ids]
      .map((id) => this._byId.get(id)!)
      .filter((rp): rp is RestorePoint => rp !== undefined)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Filtered search over the whole catalog. */
  search(query: CatalogQuery): RestorePoint[] {
    let candidates: RestorePoint[] = [...this._byId.values()];
    if (query.objectName !== undefined) {
      const ids = this._byObject.get(query.objectName);
      if (!ids) return [];
      candidates = candidates.filter((rp) => ids.has(rp.id));
    }
    if (query.sourceId !== undefined) {
      candidates = candidates.filter((rp) => rp.sourceId === query.sourceId);
    }
    if (query.policyId !== undefined) {
      candidates = candidates.filter((rp) => rp.policyId === query.policyId);
    }
    if (query.kind !== undefined) {
      candidates = candidates.filter((rp) => rp.kind === query.kind);
    }
    if (query.sinceMs !== undefined) {
      candidates = candidates.filter((rp) => rp.createdAt >= query.sinceMs!);
    }
    if (query.untilMs !== undefined) {
      candidates = candidates.filter((rp) => rp.createdAt <= query.untilMs!);
    }
    return candidates.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Full chronological chain for a source (oldest first). */
  chain(sourceId: string): RestorePoint[] {
    const list = this._bySource.get(sourceId) ?? [];
    return list.map((id) => this._byId.get(id)!).filter((rp): rp is RestorePoint => rp !== undefined);
  }

  count(): number {
    return this._byId.size;
  }

  /** All indexed object names (for inventory listings). */
  objectNames(): string[] {
    return [...this._byObject.keys()].sort();
  }
}

