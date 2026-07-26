/**
 * ValidationConfigState Entity
 */

export interface ValidationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ValidationConfigState {
  readonly data: ValidationConfigStateData;

  private constructor(data: ValidationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ValidationConfigState {
    const now = Date.now();
    return new ValidationConfigState({
      id: 'validation-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ValidationConfigState {
    return new ValidationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ValidationConfigState {
    return new ValidationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ValidationConfigState {
    return new ValidationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ValidationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ValidationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ValidationConfigState {
    return new ValidationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ValidationConfigState {
    return new ValidationConfigState({
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

  toObject(): ValidationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
