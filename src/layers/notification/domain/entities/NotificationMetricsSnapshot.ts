/**
 * NotificationMetricsSnapshot Entity
 */

export interface NotificationMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class NotificationMetricsSnapshot {
  readonly data: NotificationMetricsSnapshotData;

  private constructor(data: NotificationMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): NotificationMetricsSnapshot {
    const now = Date.now();
    return new NotificationMetricsSnapshot({
      id: 'notification-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): NotificationMetricsSnapshot {
    return new NotificationMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): NotificationMetricsSnapshot {
    return new NotificationMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): NotificationMetricsSnapshot {
    return new NotificationMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): NotificationMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new NotificationMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): NotificationMetricsSnapshot {
    return new NotificationMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NotificationMetricsSnapshot {
    return new NotificationMetricsSnapshot({
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

  toObject(): NotificationMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
