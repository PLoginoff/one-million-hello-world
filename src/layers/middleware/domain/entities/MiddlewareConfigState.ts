/**
 * MiddlewareConfigState Entity
 */

export interface MiddlewareConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MiddlewareConfigState {
  readonly data: MiddlewareConfigStateData;

  private constructor(data: MiddlewareConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MiddlewareConfigState {
    const now = Date.now();
    return new MiddlewareConfigState({
      id: 'middleware-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MiddlewareConfigState {
    return new MiddlewareConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MiddlewareConfigState {
    return new MiddlewareConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MiddlewareConfigState {
    return new MiddlewareConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MiddlewareConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MiddlewareConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MiddlewareConfigState {
    return new MiddlewareConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MiddlewareConfigState {
    return new MiddlewareConfigState({
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

  toObject(): MiddlewareConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
