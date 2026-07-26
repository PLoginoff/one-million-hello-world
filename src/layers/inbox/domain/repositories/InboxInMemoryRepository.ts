/**
 * InboxInMemoryRepository
 */

export interface InboxAggregate {
  id: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class InboxInMemoryRepository {
  private _store: Map<string, InboxAggregate>;
  private _versionCounter: number;

  constructor() {
    this._store = new Map();
    this._versionCounter = 0;
  }

  save(aggregate: InboxAggregate): InboxAggregate {
    const stored: InboxAggregate = {
      ...aggregate,
      version: ++this._versionCounter,
      updatedAt: Date.now(),
    };
    this._store.set(aggregate.id, stored);
    return stored;
  }

  findById(id: string): InboxAggregate | null {
    return this._store.get(id) ?? null;
  }

  findAll(): InboxAggregate[] {
    return Array.from(this._store.values());
  }

  findByIds(ids: string[]): InboxAggregate[] {
    return ids.map((id) => this._store.get(id)).filter((x): x is InboxAggregate => x !== null && x !== undefined);
  }

  delete(id: string): boolean {
    return this._store.delete(id);
  }

  exists(id: string): boolean {
    return this._store.has(id);
  }

  count(): number {
    return this._store.size;
  }

  clear(): void {
    this._store.clear();
    this._versionCounter = 0;
  }

  transaction(operations: Array<() => void>): void {
    const snapshot = new Map(this._store);
    try {
      operations.forEach((op) => op());
    } catch (e) {
      this._store = snapshot;
      throw e;
    }
  }
}
