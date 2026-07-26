/**
 * ThrottlingConfigState Entity
 */

export interface ThrottlingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ThrottlingConfigState {
  readonly data: ThrottlingConfigStateData;

  private constructor(data: ThrottlingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ThrottlingConfigState {
    const now = Date.now();
    return new ThrottlingConfigState({
      id: 'throttling-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ThrottlingConfigState {
    return new ThrottlingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ThrottlingConfigState {
    return new ThrottlingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ThrottlingConfigState {
    return new ThrottlingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ThrottlingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ThrottlingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ThrottlingConfigState {
    return new ThrottlingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ThrottlingConfigState {
    return new ThrottlingConfigState({
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

  toObject(): ThrottlingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
