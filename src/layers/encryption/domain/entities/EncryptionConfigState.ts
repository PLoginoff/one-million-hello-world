/**
 * EncryptionConfigState Entity
 */

export interface EncryptionConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EncryptionConfigState {
  readonly data: EncryptionConfigStateData;

  private constructor(data: EncryptionConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EncryptionConfigState {
    const now = Date.now();
    return new EncryptionConfigState({
      id: 'encryption-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EncryptionConfigState {
    return new EncryptionConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EncryptionConfigState {
    return new EncryptionConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EncryptionConfigState {
    return new EncryptionConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EncryptionConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new EncryptionConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EncryptionConfigState {
    return new EncryptionConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EncryptionConfigState {
    return new EncryptionConfigState({
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

  toObject(): EncryptionConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
