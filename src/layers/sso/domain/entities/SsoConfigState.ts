/**
 * SsoConfigState Entity
 */

export interface SsoConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SsoConfigState {
  readonly data: SsoConfigStateData;

  private constructor(data: SsoConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SsoConfigState {
    const now = Date.now();
    return new SsoConfigState({
      id: 'sso-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SsoConfigState {
    return new SsoConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SsoConfigState {
    return new SsoConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SsoConfigState {
    return new SsoConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SsoConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SsoConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SsoConfigState {
    return new SsoConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SsoConfigState {
    return new SsoConfigState({
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

  toObject(): SsoConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
