/**
 * MessageQueueExecution Entity
 *
 * Tracks a single message-queue execution.
 */

export interface MessageQueueExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MessageQueueExecution {
  readonly data: MessageQueueExecutionData;

  private constructor(data: MessageQueueExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MessageQueueExecution {
    const now = Date.now();
    return new MessageQueueExecution({
      id: 'message-queue-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MessageQueueExecution {
    return new MessageQueueExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MessageQueueExecution {
    return new MessageQueueExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MessageQueueExecution {
    return new MessageQueueExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MessageQueueExecution {
    if (this.data.tags.includes(tag)) return this;
    return new MessageQueueExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MessageQueueExecution {
    return new MessageQueueExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MessageQueueExecution {
    return new MessageQueueExecution({
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

  toObject(): MessageQueueExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
