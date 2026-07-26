/**
 * NotificationExecution Entity
 *
 * Tracks a single notification execution.
 */

export interface NotificationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class NotificationExecution {
  readonly data: NotificationExecutionData;

  private constructor(data: NotificationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): NotificationExecution {
    const now = Date.now();
    return new NotificationExecution({
      id: 'notification-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): NotificationExecution {
    return new NotificationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): NotificationExecution {
    return new NotificationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): NotificationExecution {
    return new NotificationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): NotificationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new NotificationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): NotificationExecution {
    return new NotificationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NotificationExecution {
    return new NotificationExecution({
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

  toObject(): NotificationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
