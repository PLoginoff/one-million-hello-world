/**
 * FacadeConfigState Entity
 */

export interface FacadeConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FacadeConfigState {
  readonly data: FacadeConfigStateData;

  private constructor(data: FacadeConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FacadeConfigState {
    const now = Date.now();
    return new FacadeConfigState({
      id: 'facade-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FacadeConfigState {
    return new FacadeConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FacadeConfigState {
    return new FacadeConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FacadeConfigState {
    return new FacadeConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FacadeConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new FacadeConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FacadeConfigState {
    return new FacadeConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FacadeConfigState {
    return new FacadeConfigState({
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

  toObject(): FacadeConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
