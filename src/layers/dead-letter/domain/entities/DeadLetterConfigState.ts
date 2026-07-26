/**
 * DeadLetterConfigState Entity
 */

export interface DeadLetterConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DeadLetterConfigState {
  readonly data: DeadLetterConfigStateData;

  private constructor(data: DeadLetterConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DeadLetterConfigState {
    const now = Date.now();
    return new DeadLetterConfigState({
      id: 'dead-letter-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DeadLetterConfigState {
    return new DeadLetterConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DeadLetterConfigState {
    return new DeadLetterConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DeadLetterConfigState {
    return new DeadLetterConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DeadLetterConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DeadLetterConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DeadLetterConfigState {
    return new DeadLetterConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DeadLetterConfigState {
    return new DeadLetterConfigState({
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

  toObject(): DeadLetterConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
