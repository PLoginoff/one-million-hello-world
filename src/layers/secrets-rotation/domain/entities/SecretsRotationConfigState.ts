/**
 * SecretsRotationConfigState Entity
 */

export interface SecretsRotationConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecretsRotationConfigState {
  readonly data: SecretsRotationConfigStateData;

  private constructor(data: SecretsRotationConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SecretsRotationConfigState {
    const now = Date.now();
    return new SecretsRotationConfigState({
      id: 'secrets-rotation-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SecretsRotationConfigState {
    return new SecretsRotationConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SecretsRotationConfigState {
    return new SecretsRotationConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SecretsRotationConfigState {
    return new SecretsRotationConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SecretsRotationConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SecretsRotationConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SecretsRotationConfigState {
    return new SecretsRotationConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecretsRotationConfigState {
    return new SecretsRotationConfigState({
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

  toObject(): SecretsRotationConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
