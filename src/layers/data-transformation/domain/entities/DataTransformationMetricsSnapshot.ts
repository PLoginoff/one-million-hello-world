/**
 * DataTransformationMetricsSnapshot Entity
 */

export interface DataTransformationMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataTransformationMetricsSnapshot {
  readonly data: DataTransformationMetricsSnapshotData;

  private constructor(data: DataTransformationMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataTransformationMetricsSnapshot {
    const now = Date.now();
    return new DataTransformationMetricsSnapshot({
      id: 'data-transformation-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataTransformationMetricsSnapshot {
    return new DataTransformationMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataTransformationMetricsSnapshot {
    return new DataTransformationMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataTransformationMetricsSnapshot {
    return new DataTransformationMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataTransformationMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new DataTransformationMetricsSnapshot({
      ...this.data,
      tags: [...this.data.tags, tag],
      updatedAt: Date.now(),
    });
  }

  removeTag(tag: string): DataTransformationMetricsSnapshot {
    return new DataTransformationMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataTransformationMetricsSnapshot {
    return new DataTransformationMetricsSnapshot({
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

  toObject(): DataTransformationMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
