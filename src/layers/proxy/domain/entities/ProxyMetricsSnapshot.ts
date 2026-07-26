/**
 * ProxyMetricsSnapshot Entity
 */

export interface ProxyMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ProxyMetricsSnapshot {
  readonly data: ProxyMetricsSnapshotData;

  private constructor(data: ProxyMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ProxyMetricsSnapshot {
    const now = Date.now();
    return new ProxyMetricsSnapshot({
      id: 'proxy-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ProxyMetricsSnapshot {
    return new ProxyMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ProxyMetricsSnapshot {
    return new ProxyMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ProxyMetricsSnapshot {
    return new ProxyMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ProxyMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ProxyMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ProxyMetricsSnapshot {
    return new ProxyMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ProxyMetricsSnapshot {
    return new ProxyMetricsSnapshot({
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

  toObject(): ProxyMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
