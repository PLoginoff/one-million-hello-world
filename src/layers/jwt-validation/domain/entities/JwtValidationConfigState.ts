/**
 * JwtValidationConfigState Entity
 */

export interface JwtValidationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class JwtValidationConfigState {
  readonly data: JwtValidationConfigStateData;

  private constructor(data: JwtValidationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): JwtValidationConfigState {
    const now = Date.now();
    return new JwtValidationConfigState({
      id: 'jwt-validation-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): JwtValidationConfigState {
    return new JwtValidationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): JwtValidationConfigState {
    return new JwtValidationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): JwtValidationConfigState {
    return new JwtValidationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): JwtValidationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new JwtValidationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): JwtValidationConfigState {
    return new JwtValidationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): JwtValidationConfigState {
    return new JwtValidationConfigState({
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

  toObject(): JwtValidationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
