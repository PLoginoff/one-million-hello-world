/**
 * MfaConfigState Entity
 */

export interface MfaConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MfaConfigState {
  readonly data: MfaConfigStateData;

  private constructor(data: MfaConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MfaConfigState {
    const now = Date.now();
    return new MfaConfigState({
      id: 'mfa-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MfaConfigState {
    return new MfaConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MfaConfigState {
    return new MfaConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MfaConfigState {
    return new MfaConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MfaConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MfaConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MfaConfigState {
    return new MfaConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MfaConfigState {
    return new MfaConfigState({
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

  toObject(): MfaConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
