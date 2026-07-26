/**
 * OutboxMetricsSnapshot Entity
 */

export interface OutboxMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class OutboxMetricsSnapshot {
  readonly data: OutboxMetricsSnapshotData;

  private constructor(data: OutboxMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): OutboxMetricsSnapshot {
    const now = Date.now();
    return new OutboxMetricsSnapshot({
      id: 'outbox-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): OutboxMetricsSnapshot {
    return new OutboxMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): OutboxMetricsSnapshot {
    return new OutboxMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): OutboxMetricsSnapshot {
    return new OutboxMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): OutboxMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new OutboxMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): OutboxMetricsSnapshot {
    return new OutboxMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): OutboxMetricsSnapshot {
    return new OutboxMetricsSnapshot({
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

  toObject(): OutboxMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
