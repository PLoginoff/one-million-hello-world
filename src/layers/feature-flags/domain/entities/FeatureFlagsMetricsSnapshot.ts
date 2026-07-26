/**
 * FeatureFlagsMetricsSnapshot Entity
 */

export interface FeatureFlagsMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FeatureFlagsMetricsSnapshot {
  readonly data: FeatureFlagsMetricsSnapshotData;

  private constructor(data: FeatureFlagsMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FeatureFlagsMetricsSnapshot {
    const now = Date.now();
    return new FeatureFlagsMetricsSnapshot({
      id: 'feature-flags-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FeatureFlagsMetricsSnapshot {
    return new FeatureFlagsMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FeatureFlagsMetricsSnapshot {
    return new FeatureFlagsMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FeatureFlagsMetricsSnapshot {
    return new FeatureFlagsMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FeatureFlagsMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new FeatureFlagsMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FeatureFlagsMetricsSnapshot {
    return new FeatureFlagsMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FeatureFlagsMetricsSnapshot {
    return new FeatureFlagsMetricsSnapshot({
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

  toObject(): FeatureFlagsMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
