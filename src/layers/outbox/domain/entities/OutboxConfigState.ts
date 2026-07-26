/**
 * OutboxConfigState Entity
 */

export interface OutboxConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class OutboxConfigState {
  readonly data: OutboxConfigStateData;

  private constructor(data: OutboxConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): OutboxConfigState {
    const now = Date.now();
    return new OutboxConfigState({
      id: 'outbox-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): OutboxConfigState {
    return new OutboxConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): OutboxConfigState {
    return new OutboxConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): OutboxConfigState {
    return new OutboxConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): OutboxConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new OutboxConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): OutboxConfigState {
    return new OutboxConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): OutboxConfigState {
    return new OutboxConfigState({
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

  toObject(): OutboxConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
