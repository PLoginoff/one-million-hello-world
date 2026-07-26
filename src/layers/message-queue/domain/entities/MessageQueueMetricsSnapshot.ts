/**
 * MessageQueueMetricsSnapshot Entity
 */

export interface MessageQueueMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MessageQueueMetricsSnapshot {
  readonly data: MessageQueueMetricsSnapshotData;

  private constructor(data: MessageQueueMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MessageQueueMetricsSnapshot {
    const now = Date.now();
    return new MessageQueueMetricsSnapshot({
      id: 'message-queue-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MessageQueueMetricsSnapshot {
    return new MessageQueueMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MessageQueueMetricsSnapshot {
    return new MessageQueueMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MessageQueueMetricsSnapshot {
    return new MessageQueueMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MessageQueueMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new MessageQueueMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MessageQueueMetricsSnapshot {
    return new MessageQueueMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MessageQueueMetricsSnapshot {
    return new MessageQueueMetricsSnapshot({
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

  toObject(): MessageQueueMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
