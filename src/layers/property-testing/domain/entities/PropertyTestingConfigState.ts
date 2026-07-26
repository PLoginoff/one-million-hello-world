/**
 * PropertyTestingConfigState Entity
 */

export interface PropertyTestingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PropertyTestingConfigState {
  readonly data: PropertyTestingConfigStateData;

  private constructor(data: PropertyTestingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): PropertyTestingConfigState {
    const now = Date.now();
    return new PropertyTestingConfigState({
      id: 'property-testing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): PropertyTestingConfigState {
    return new PropertyTestingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): PropertyTestingConfigState {
    return new PropertyTestingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): PropertyTestingConfigState {
    return new PropertyTestingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): PropertyTestingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new PropertyTestingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): PropertyTestingConfigState {
    return new PropertyTestingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): PropertyTestingConfigState {
    return new PropertyTestingConfigState({
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

  toObject(): PropertyTestingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
