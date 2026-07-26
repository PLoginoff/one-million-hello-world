/**
 * UnitOfWorkConfigState Entity
 */

export interface UnitOfWorkConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class UnitOfWorkConfigState {
  readonly data: UnitOfWorkConfigStateData;

  private constructor(data: UnitOfWorkConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): UnitOfWorkConfigState {
    const now = Date.now();
    return new UnitOfWorkConfigState({
      id: 'unit-of-work-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): UnitOfWorkConfigState {
    return new UnitOfWorkConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): UnitOfWorkConfigState {
    return new UnitOfWorkConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): UnitOfWorkConfigState {
    return new UnitOfWorkConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): UnitOfWorkConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new UnitOfWorkConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): UnitOfWorkConfigState {
    return new UnitOfWorkConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): UnitOfWorkConfigState {
    return new UnitOfWorkConfigState({
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

  toObject(): UnitOfWorkConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
