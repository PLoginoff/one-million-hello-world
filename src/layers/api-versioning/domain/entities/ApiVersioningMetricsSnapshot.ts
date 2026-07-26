/**
 * ApiVersioningMetricsSnapshot Entity
 */

export interface ApiVersioningMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ApiVersioningMetricsSnapshot {
  readonly data: ApiVersioningMetricsSnapshotData;

  private constructor(data: ApiVersioningMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ApiVersioningMetricsSnapshot {
    const now = Date.now();
    return new ApiVersioningMetricsSnapshot({
      id: 'api-versioning-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ApiVersioningMetricsSnapshot {
    return new ApiVersioningMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ApiVersioningMetricsSnapshot {
    return new ApiVersioningMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ApiVersioningMetricsSnapshot {
    return new ApiVersioningMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ApiVersioningMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ApiVersioningMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ApiVersioningMetricsSnapshot {
    return new ApiVersioningMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ApiVersioningMetricsSnapshot {
    return new ApiVersioningMetricsSnapshot({
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

  toObject(): ApiVersioningMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
