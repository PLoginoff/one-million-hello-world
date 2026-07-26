/**
 * RetryConfigState Entity
 */

export interface RetryConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RetryConfigState {
  readonly data: RetryConfigStateData;

  private constructor(data: RetryConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RetryConfigState {
    const now = Date.now();
    return new RetryConfigState({
      id: 'retry-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RetryConfigState {
    return new RetryConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RetryConfigState {
    return new RetryConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RetryConfigState {
    return new RetryConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RetryConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new RetryConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RetryConfigState {
    return new RetryConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RetryConfigState {
    return new RetryConfigState({
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

  toObject(): RetryConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
