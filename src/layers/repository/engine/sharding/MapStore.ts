/**
 * MapStore — minimal `ShardStore` backed by a `Map<id, row>`.
 *
 * Exists so tests and the facade don't have to fake a store: it's the
 * honest in-memory implementation of the narrow contract — insert by `id`
 * field (or a custom key extractor), get, scan, delete, size.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { getPath } from '../path';
import { ShardStore } from './types';

export interface MapStoreOptions<T> {
  /** Extracts the primary key from a row. Default: `row.id`. */
  readonly idOf?: (row: T) => string;
}

export class MapStore<T> implements ShardStore<T> {
  private readonly rows = new Map<string, T>();
  private readonly idOf: (row: T) => string;

  constructor(options: MapStoreOptions<T> = {}) {
    this.idOf = options.idOf ?? ((row) => String(getPath(row, 'id')));
  }

  insert(row: T): T {
    this.rows.set(this.idOf(row), row);
    return row;
  }

  get(id: string): T | null {
    return this.rows.get(id) ?? null;
  }

  scan(pred: (row: T) => boolean): T[] {
    const out: T[] = [];
    for (const r of this.rows.values()) if (pred(r)) out.push(r);
    return out;
  }

  delete(id: string): boolean {
    return this.rows.delete(id);
  }

  size(): number {
    return this.rows.size;
  }

  clear(): void {
    this.rows.clear();
  }
}
