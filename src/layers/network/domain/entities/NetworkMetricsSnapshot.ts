/**
 * NetworkMetricsSnapshot Entity
 */

export interface NetworkMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class NetworkMetricsSnapshot {
  readonly data: NetworkMetricsSnapshotData;

  private constructor(data: NetworkMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): NetworkMetricsSnapshot {
    const now = Date.now();
    return new NetworkMetricsSnapshot({
      id: 'network-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): NetworkMetricsSnapshot {
    return new NetworkMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): NetworkMetricsSnapshot {
    return new NetworkMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): NetworkMetricsSnapshot {
    return new NetworkMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): NetworkMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new NetworkMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): NetworkMetricsSnapshot {
    return new NetworkMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NetworkMetricsSnapshot {
    return new NetworkMetricsSnapshot({
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

  toObject(): NetworkMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
