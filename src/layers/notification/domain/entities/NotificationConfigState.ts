/**
 * NotificationConfigState Entity
 */

export interface NotificationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class NotificationConfigState {
  readonly data: NotificationConfigStateData;

  private constructor(data: NotificationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): NotificationConfigState {
    const now = Date.now();
    return new NotificationConfigState({
      id: 'notification-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): NotificationConfigState {
    return new NotificationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): NotificationConfigState {
    return new NotificationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): NotificationConfigState {
    return new NotificationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): NotificationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new NotificationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): NotificationConfigState {
    return new NotificationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NotificationConfigState {
    return new NotificationConfigState({
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

  toObject(): NotificationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
