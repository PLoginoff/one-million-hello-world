/**
 * LoadBalancerMetricsSnapshot Entity
 */

export interface LoadBalancerMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LoadBalancerMetricsSnapshot {
  readonly data: LoadBalancerMetricsSnapshotData;

  private constructor(data: LoadBalancerMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): LoadBalancerMetricsSnapshot {
    const now = Date.now();
    return new LoadBalancerMetricsSnapshot({
      id: 'load-balancer-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): LoadBalancerMetricsSnapshot {
    return new LoadBalancerMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): LoadBalancerMetricsSnapshot {
    return new LoadBalancerMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): LoadBalancerMetricsSnapshot {
    return new LoadBalancerMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): LoadBalancerMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new LoadBalancerMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): LoadBalancerMetricsSnapshot {
    return new LoadBalancerMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): LoadBalancerMetricsSnapshot {
    return new LoadBalancerMetricsSnapshot({
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

  toObject(): LoadBalancerMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
