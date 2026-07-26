/**
 * ApiVersioningInMemoryRepository
 */

export interface ApiVersioningAggregate {
  id: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class ApiVersioningInMemoryRepository {
  private _store: Map<string, ApiVersioningAggregate>;
  private _versionCounter: number;

  constructor() {
    this._store = new Map();
    this._versionCounter = 0;
  }

  save(aggregate: ApiVersioningAggregate): ApiVersioningAggregate {
    const stored: ApiVersioningAggregate = {
      ...aggregate,
      version: ++this._versionCounter,
      updatedAt: Date.now(),
    };
    this._store.set(aggregate.id, stored);
    return stored;
  }

  findById(id: string): ApiVersioningAggregate | null {
    return this._store.get(id) ?? null;
  }

  findAll(): ApiVersioningAggregate[] {
    return Array.from(this._store.values());
  }

  findByIds(ids: string[]): ApiVersioningAggregate[] {
    return ids
      .map((id) => this._store.get(id))
      .filter((x): x is ApiVersioningAggregate => x !== null && x !== undefined);
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
