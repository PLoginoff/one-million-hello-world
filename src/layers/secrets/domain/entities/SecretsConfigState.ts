/**
 * SecretsConfigState Entity
 */

export interface SecretsConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecretsConfigState {
  readonly data: SecretsConfigStateData;

  private constructor(data: SecretsConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SecretsConfigState {
    const now = Date.now();
    return new SecretsConfigState({
      id: 'secrets-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SecretsConfigState {
    return new SecretsConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SecretsConfigState {
    return new SecretsConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SecretsConfigState {
    return new SecretsConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SecretsConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SecretsConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SecretsConfigState {
    return new SecretsConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecretsConfigState {
    return new SecretsConfigState({
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

  toObject(): SecretsConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
