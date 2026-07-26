/**
 * AnalyticsMetricsSnapshot Entity
 */

export interface AnalyticsMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnalyticsMetricsSnapshot {
  readonly data: AnalyticsMetricsSnapshotData;

  private constructor(data: AnalyticsMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AnalyticsMetricsSnapshot {
    const now = Date.now();
    return new AnalyticsMetricsSnapshot({
      id: 'analytics-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AnalyticsMetricsSnapshot {
    return new AnalyticsMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AnalyticsMetricsSnapshot {
    return new AnalyticsMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AnalyticsMetricsSnapshot {
    return new AnalyticsMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AnalyticsMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new AnalyticsMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AnalyticsMetricsSnapshot {
    return new AnalyticsMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnalyticsMetricsSnapshot {
    return new AnalyticsMetricsSnapshot({
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

  toObject(): AnalyticsMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
