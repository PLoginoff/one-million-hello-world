/**
 * DataLineageMetricsSnapshot Entity
 */

export interface DataLineageMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataLineageMetricsSnapshot {
  readonly data: DataLineageMetricsSnapshotData;

  private constructor(data: DataLineageMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataLineageMetricsSnapshot {
    const now = Date.now();
    return new DataLineageMetricsSnapshot({
      id: 'data-lineage-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataLineageMetricsSnapshot {
    return new DataLineageMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataLineageMetricsSnapshot {
    return new DataLineageMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataLineageMetricsSnapshot {
    return new DataLineageMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataLineageMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new DataLineageMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataLineageMetricsSnapshot {
    return new DataLineageMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataLineageMetricsSnapshot {
    return new DataLineageMetricsSnapshot({
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

  toObject(): DataLineageMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
