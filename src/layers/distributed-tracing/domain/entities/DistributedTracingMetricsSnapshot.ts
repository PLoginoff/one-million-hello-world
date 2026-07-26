/**
 * DistributedTracingMetricsSnapshot Entity
 */

export interface DistributedTracingMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DistributedTracingMetricsSnapshot {
  readonly data: DistributedTracingMetricsSnapshotData;

  private constructor(data: DistributedTracingMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DistributedTracingMetricsSnapshot {
    const now = Date.now();
    return new DistributedTracingMetricsSnapshot({
      id: 'distributed-tracing-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DistributedTracingMetricsSnapshot {
    return new DistributedTracingMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DistributedTracingMetricsSnapshot {
    return new DistributedTracingMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DistributedTracingMetricsSnapshot {
    return new DistributedTracingMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DistributedTracingMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new DistributedTracingMetricsSnapshot({
      ...this.data,
      tags: [...this.data.tags, tag],
      updatedAt: Date.now(),
    });
  }

  removeTag(tag: string): DistributedTracingMetricsSnapshot {
    return new DistributedTracingMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DistributedTracingMetricsSnapshot {
    return new DistributedTracingMetricsSnapshot({
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

  toObject(): DistributedTracingMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
