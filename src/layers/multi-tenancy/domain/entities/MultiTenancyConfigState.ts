/**
 * MultiTenancyConfigState Entity
 */

export interface MultiTenancyConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MultiTenancyConfigState {
  readonly data: MultiTenancyConfigStateData;

  private constructor(data: MultiTenancyConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MultiTenancyConfigState {
    const now = Date.now();
    return new MultiTenancyConfigState({
      id: 'multi-tenancy-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MultiTenancyConfigState {
    return new MultiTenancyConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MultiTenancyConfigState {
    return new MultiTenancyConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MultiTenancyConfigState {
    return new MultiTenancyConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MultiTenancyConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MultiTenancyConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MultiTenancyConfigState {
    return new MultiTenancyConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MultiTenancyConfigState {
    return new MultiTenancyConfigState({
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

  toObject(): MultiTenancyConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
