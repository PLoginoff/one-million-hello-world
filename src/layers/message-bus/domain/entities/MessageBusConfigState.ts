/**
 * MessageBusConfigState Entity
 */

export interface MessageBusConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MessageBusConfigState {
  readonly data: MessageBusConfigStateData;

  private constructor(data: MessageBusConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MessageBusConfigState {
    const now = Date.now();
    return new MessageBusConfigState({
      id: 'message-bus-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MessageBusConfigState {
    return new MessageBusConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MessageBusConfigState {
    return new MessageBusConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MessageBusConfigState {
    return new MessageBusConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MessageBusConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MessageBusConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MessageBusConfigState {
    return new MessageBusConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MessageBusConfigState {
    return new MessageBusConfigState({
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

  toObject(): MessageBusConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
