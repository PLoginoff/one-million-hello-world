/**
 * MultiTenancyMetricsSnapshot Entity
 */

export interface MultiTenancyMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MultiTenancyMetricsSnapshot {
  readonly data: MultiTenancyMetricsSnapshotData;

  private constructor(data: MultiTenancyMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MultiTenancyMetricsSnapshot {
    const now = Date.now();
    return new MultiTenancyMetricsSnapshot({
      id: 'multi-tenancy-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MultiTenancyMetricsSnapshot {
    return new MultiTenancyMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MultiTenancyMetricsSnapshot {
    return new MultiTenancyMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MultiTenancyMetricsSnapshot {
    return new MultiTenancyMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MultiTenancyMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new MultiTenancyMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MultiTenancyMetricsSnapshot {
    return new MultiTenancyMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MultiTenancyMetricsSnapshot {
    return new MultiTenancyMetricsSnapshot({
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

  toObject(): MultiTenancyMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
