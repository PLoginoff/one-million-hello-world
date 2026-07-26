/**
 * AuthorizationConfigState Entity
 */

export interface AuthorizationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AuthorizationConfigState {
  readonly data: AuthorizationConfigStateData;

  private constructor(data: AuthorizationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AuthorizationConfigState {
    const now = Date.now();
    return new AuthorizationConfigState({
      id: 'authorization-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AuthorizationConfigState {
    return new AuthorizationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AuthorizationConfigState {
    return new AuthorizationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AuthorizationConfigState {
    return new AuthorizationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AuthorizationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new AuthorizationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AuthorizationConfigState {
    return new AuthorizationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AuthorizationConfigState {
    return new AuthorizationConfigState({
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

  toObject(): AuthorizationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
