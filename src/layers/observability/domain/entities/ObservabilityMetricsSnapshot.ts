/**
 * ObservabilityMetricsSnapshot Entity
 */

export interface ObservabilityMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ObservabilityMetricsSnapshot {
  readonly data: ObservabilityMetricsSnapshotData;

  private constructor(data: ObservabilityMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ObservabilityMetricsSnapshot {
    const now = Date.now();
    return new ObservabilityMetricsSnapshot({
      id: 'observability-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ObservabilityMetricsSnapshot {
    return new ObservabilityMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ObservabilityMetricsSnapshot {
    return new ObservabilityMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ObservabilityMetricsSnapshot {
    return new ObservabilityMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ObservabilityMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ObservabilityMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ObservabilityMetricsSnapshot {
    return new ObservabilityMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ObservabilityMetricsSnapshot {
    return new ObservabilityMetricsSnapshot({
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

  toObject(): ObservabilityMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
