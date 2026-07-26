/**
 * RouterConfigState Entity
 */

export interface RouterConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RouterConfigState {
  readonly data: RouterConfigStateData;

  private constructor(data: RouterConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RouterConfigState {
    const now = Date.now();
    return new RouterConfigState({
      id: 'router-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RouterConfigState {
    return new RouterConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RouterConfigState {
    return new RouterConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RouterConfigState {
    return new RouterConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RouterConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new RouterConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RouterConfigState {
    return new RouterConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RouterConfigState {
    return new RouterConfigState({
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

  toObject(): RouterConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
