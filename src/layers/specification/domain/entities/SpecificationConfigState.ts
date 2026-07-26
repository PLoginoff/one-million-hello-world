/**
 * SpecificationConfigState Entity
 */

export interface SpecificationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SpecificationConfigState {
  readonly data: SpecificationConfigStateData;

  private constructor(data: SpecificationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SpecificationConfigState {
    const now = Date.now();
    return new SpecificationConfigState({
      id: 'specification-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SpecificationConfigState {
    return new SpecificationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SpecificationConfigState {
    return new SpecificationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SpecificationConfigState {
    return new SpecificationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SpecificationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SpecificationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SpecificationConfigState {
    return new SpecificationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SpecificationConfigState {
    return new SpecificationConfigState({
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

  toObject(): SpecificationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
