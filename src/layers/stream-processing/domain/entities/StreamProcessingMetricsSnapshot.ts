/**
 * StreamProcessingMetricsSnapshot Entity
 */

export interface StreamProcessingMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StreamProcessingMetricsSnapshot {
  readonly data: StreamProcessingMetricsSnapshotData;

  private constructor(data: StreamProcessingMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): StreamProcessingMetricsSnapshot {
    const now = Date.now();
    return new StreamProcessingMetricsSnapshot({
      id: 'stream-processing-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): StreamProcessingMetricsSnapshot {
    return new StreamProcessingMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): StreamProcessingMetricsSnapshot {
    return new StreamProcessingMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): StreamProcessingMetricsSnapshot {
    return new StreamProcessingMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): StreamProcessingMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new StreamProcessingMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): StreamProcessingMetricsSnapshot {
    return new StreamProcessingMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): StreamProcessingMetricsSnapshot {
    return new StreamProcessingMetricsSnapshot({
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

  toObject(): StreamProcessingMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
