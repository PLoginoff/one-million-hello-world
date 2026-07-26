/**
 * Oauth2ConfigState Entity
 */

export interface Oauth2ConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class Oauth2ConfigState {
  readonly data: Oauth2ConfigStateData;

  private constructor(data: Oauth2ConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): Oauth2ConfigState {
    const now = Date.now();
    return new Oauth2ConfigState({
      id: 'oauth2-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): Oauth2ConfigState {
    return new Oauth2ConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): Oauth2ConfigState {
    return new Oauth2ConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): Oauth2ConfigState {
    return new Oauth2ConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): Oauth2ConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new Oauth2ConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): Oauth2ConfigState {
    return new Oauth2ConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): Oauth2ConfigState {
    return new Oauth2ConfigState({
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

  toObject(): Oauth2ConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
