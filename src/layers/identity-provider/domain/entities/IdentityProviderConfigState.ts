/**
 * IdentityProviderConfigState Entity
 */

export interface IdentityProviderConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class IdentityProviderConfigState {
  readonly data: IdentityProviderConfigStateData;

  private constructor(data: IdentityProviderConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): IdentityProviderConfigState {
    const now = Date.now();
    return new IdentityProviderConfigState({
      id: 'identity-provider-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): IdentityProviderConfigState {
    return new IdentityProviderConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): IdentityProviderConfigState {
    return new IdentityProviderConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): IdentityProviderConfigState {
    return new IdentityProviderConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): IdentityProviderConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new IdentityProviderConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): IdentityProviderConfigState {
    return new IdentityProviderConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): IdentityProviderConfigState {
    return new IdentityProviderConfigState({
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

  toObject(): IdentityProviderConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
