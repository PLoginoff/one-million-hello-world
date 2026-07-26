/**
 * BpmnQueryService
 */

export interface QueryOptions {
  filter?: Record<string, unknown>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  fields?: string[];
}

export interface QueryResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export class BpmnQueryService {
  private _data: Map<string, Record<string, unknown>>;

  constructor() {
    this._data = new Map();
  }

  insert(id: string, item: Record<string, unknown>): void {
    this._data.set(id, { ...item, _id: id });
  }

  update(id: string, patch: Record<string, unknown>): boolean {
    const existing = this._data.get(id);
    if (!existing) return false;
    this._data.set(id, { ...existing, ...patch, _id: id });
    return true;
  }

  delete(id: string): boolean {
    return this._data.delete(id);
  }

  findById(id: string): Record<string, unknown> | null {
    return this._data.get(id) ?? null;
  }

  query(options: QueryOptions = {}): QueryResult<Record<string, unknown>> {
    let items = Array.from(this._data.values());

    if (options.filter) {
      const filter = options.filter;
      items = items.filter((item) => Object.entries(filter).every(([k, v]) => item[k] === v));
    }

    if (options.sort) {
      const sortField = options.sort.field;
      const direction = options.sort.direction;
      items.sort((a, b) => {
        const av = a[sortField] as number | string;
        const bv = b[sortField] as number | string;
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return direction === 'desc' ? -cmp : cmp;
      });
    }

    const total = items.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? total;
    let paged = items.slice(offset, offset + limit);

    if (options.fields) {
      const fields = options.fields;
      paged = paged.map((item) => {
        const projected: Record<string, unknown> = {};
        fields.forEach((f) => {
          projected[f] = item[f];
        });
        return projected;
      });
    }

    return { items: paged, total: total, hasMore: offset + limit < total };
  }

  count(filter?: Record<string, unknown>): number {
    if (!filter) return this._data.size;
    return this.query({ filter: filter }).total;
  }

  clear(): void {
    this._data.clear();
  }
  size(): number {
    return this._data.size;
  }
}
