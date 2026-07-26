/**
 * CompressionMetricsSnapshot Entity
 */

export interface CompressionMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CompressionMetricsSnapshot {
  readonly data: CompressionMetricsSnapshotData;

  private constructor(data: CompressionMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CompressionMetricsSnapshot {
    const now = Date.now();
    return new CompressionMetricsSnapshot({
      id: 'compression-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CompressionMetricsSnapshot {
    return new CompressionMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CompressionMetricsSnapshot {
    return new CompressionMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CompressionMetricsSnapshot {
    return new CompressionMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CompressionMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new CompressionMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CompressionMetricsSnapshot {
    return new CompressionMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CompressionMetricsSnapshot {
    return new CompressionMetricsSnapshot({
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

  toObject(): CompressionMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
