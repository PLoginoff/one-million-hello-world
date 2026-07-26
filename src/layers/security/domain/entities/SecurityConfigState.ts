/**
 * SecurityConfigState Entity
 */

export interface SecurityConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecurityConfigState {
  readonly data: SecurityConfigStateData;

  private constructor(data: SecurityConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SecurityConfigState {
    const now = Date.now();
    return new SecurityConfigState({
      id: 'security-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SecurityConfigState {
    return new SecurityConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SecurityConfigState {
    return new SecurityConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SecurityConfigState {
    return new SecurityConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SecurityConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SecurityConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SecurityConfigState {
    return new SecurityConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecurityConfigState {
    return new SecurityConfigState({
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

  toObject(): SecurityConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
