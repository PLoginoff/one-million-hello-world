/**
 * ServiceMeshMetricsSnapshot Entity
 */

export interface ServiceMeshMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceMeshMetricsSnapshot {
  readonly data: ServiceMeshMetricsSnapshotData;

  private constructor(data: ServiceMeshMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ServiceMeshMetricsSnapshot {
    const now = Date.now();
    return new ServiceMeshMetricsSnapshot({
      id: 'service-mesh-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ServiceMeshMetricsSnapshot {
    return new ServiceMeshMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ServiceMeshMetricsSnapshot {
    return new ServiceMeshMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ServiceMeshMetricsSnapshot {
    return new ServiceMeshMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ServiceMeshMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ServiceMeshMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ServiceMeshMetricsSnapshot {
    return new ServiceMeshMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ServiceMeshMetricsSnapshot {
    return new ServiceMeshMetricsSnapshot({
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

  toObject(): ServiceMeshMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
