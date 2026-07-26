/**
 * ServiceMeshInMemoryRepository
 */

export interface ServiceMeshAggregate {
  id: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class ServiceMeshInMemoryRepository {
  private _store: Map<string, ServiceMeshAggregate>;
  private _versionCounter: number;

  constructor() {
    this._store = new Map();
    this._versionCounter = 0;
  }

  save(aggregate: ServiceMeshAggregate): ServiceMeshAggregate {
    const stored: ServiceMeshAggregate = {
      ...aggregate,
      version: ++this._versionCounter,
      updatedAt: Date.now(),
    };
    this._store.set(aggregate.id, stored);
    return stored;
  }

  findById(id: string): ServiceMeshAggregate | null {
    return this._store.get(id) ?? null;
  }

  findAll(): ServiceMeshAggregate[] {
    return Array.from(this._store.values());
  }

  findByIds(ids: string[]): ServiceMeshAggregate[] {
    return ids.map((id) => this._store.get(id)).filter((x): x is ServiceMeshAggregate => x !== null && x !== undefined);
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
