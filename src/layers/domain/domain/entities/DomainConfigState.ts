/**
 * DomainConfigState Entity
 */

export interface DomainConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DomainConfigState {
  readonly data: DomainConfigStateData;

  private constructor(data: DomainConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DomainConfigState {
    const now = Date.now();
    return new DomainConfigState({
      id: 'domain-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DomainConfigState {
    return new DomainConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DomainConfigState {
    return new DomainConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DomainConfigState {
    return new DomainConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DomainConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DomainConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DomainConfigState {
    return new DomainConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DomainConfigState {
    return new DomainConfigState({
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

  toObject(): DomainConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
