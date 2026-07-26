/**
 * DecoratorConfigState Entity
 */

export interface DecoratorConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DecoratorConfigState {
  readonly data: DecoratorConfigStateData;

  private constructor(data: DecoratorConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DecoratorConfigState {
    const now = Date.now();
    return new DecoratorConfigState({
      id: 'decorator-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DecoratorConfigState {
    return new DecoratorConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DecoratorConfigState {
    return new DecoratorConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DecoratorConfigState {
    return new DecoratorConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DecoratorConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DecoratorConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DecoratorConfigState {
    return new DecoratorConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DecoratorConfigState {
    return new DecoratorConfigState({
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

  toObject(): DecoratorConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
