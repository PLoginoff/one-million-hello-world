/**
 * SerializationMetricsSnapshot Entity
 */

export interface SerializationMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SerializationMetricsSnapshot {
  readonly data: SerializationMetricsSnapshotData;

  private constructor(data: SerializationMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SerializationMetricsSnapshot {
    const now = Date.now();
    return new SerializationMetricsSnapshot({
      id: 'serialization-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SerializationMetricsSnapshot {
    return new SerializationMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SerializationMetricsSnapshot {
    return new SerializationMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SerializationMetricsSnapshot {
    return new SerializationMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SerializationMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new SerializationMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SerializationMetricsSnapshot {
    return new SerializationMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SerializationMetricsSnapshot {
    return new SerializationMetricsSnapshot({
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

  toObject(): SerializationMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
