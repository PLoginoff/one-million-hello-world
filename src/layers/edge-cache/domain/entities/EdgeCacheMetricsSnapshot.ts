/**
 * EdgeCacheMetricsSnapshot Entity
 */

export interface EdgeCacheMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EdgeCacheMetricsSnapshot {
  readonly data: EdgeCacheMetricsSnapshotData;

  private constructor(data: EdgeCacheMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EdgeCacheMetricsSnapshot {
    const now = Date.now();
    return new EdgeCacheMetricsSnapshot({
      id: 'edge-cache-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EdgeCacheMetricsSnapshot {
    return new EdgeCacheMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EdgeCacheMetricsSnapshot {
    return new EdgeCacheMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EdgeCacheMetricsSnapshot {
    return new EdgeCacheMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EdgeCacheMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new EdgeCacheMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EdgeCacheMetricsSnapshot {
    return new EdgeCacheMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EdgeCacheMetricsSnapshot {
    return new EdgeCacheMetricsSnapshot({
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

  toObject(): EdgeCacheMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
