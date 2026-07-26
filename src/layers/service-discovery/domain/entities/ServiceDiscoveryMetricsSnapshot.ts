/**
 * ServiceDiscoveryMetricsSnapshot Entity
 */

export interface ServiceDiscoveryMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceDiscoveryMetricsSnapshot {
  readonly data: ServiceDiscoveryMetricsSnapshotData;

  private constructor(data: ServiceDiscoveryMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ServiceDiscoveryMetricsSnapshot {
    const now = Date.now();
    return new ServiceDiscoveryMetricsSnapshot({
      id: 'service-discovery-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ServiceDiscoveryMetricsSnapshot {
    return new ServiceDiscoveryMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ServiceDiscoveryMetricsSnapshot {
    return new ServiceDiscoveryMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ServiceDiscoveryMetricsSnapshot {
    return new ServiceDiscoveryMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ServiceDiscoveryMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ServiceDiscoveryMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ServiceDiscoveryMetricsSnapshot {
    return new ServiceDiscoveryMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ServiceDiscoveryMetricsSnapshot {
    return new ServiceDiscoveryMetricsSnapshot({
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

  toObject(): ServiceDiscoveryMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
