/**
 * DataWarehouseMetricsSnapshot Entity
 */

export interface DataWarehouseMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataWarehouseMetricsSnapshot {
  readonly data: DataWarehouseMetricsSnapshotData;

  private constructor(data: DataWarehouseMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataWarehouseMetricsSnapshot {
    const now = Date.now();
    return new DataWarehouseMetricsSnapshot({
      id: 'data-warehouse-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataWarehouseMetricsSnapshot {
    return new DataWarehouseMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataWarehouseMetricsSnapshot {
    return new DataWarehouseMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataWarehouseMetricsSnapshot {
    return new DataWarehouseMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataWarehouseMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new DataWarehouseMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataWarehouseMetricsSnapshot {
    return new DataWarehouseMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataWarehouseMetricsSnapshot {
    return new DataWarehouseMetricsSnapshot({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  isPending(): boolean {
    return this.data.status === 'pending';
  }
  isActive(): boolean {
    return this.data.status === 'active';
  }
  isCompleted(): boolean {
    return this.data.status === 'completed';
  }
  isFailed(): boolean {
    return this.data.status === 'failed';
  }

  toObject(): DataWarehouseMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
