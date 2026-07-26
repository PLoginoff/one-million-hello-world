/**
 * EncryptionExecution Entity
 *
 * Tracks a single encryption execution.
 */

export interface EncryptionExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EncryptionExecution {
  readonly data: EncryptionExecutionData;

  private constructor(data: EncryptionExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EncryptionExecution {
    const now = Date.now();
    return new EncryptionExecution({
      id: 'encryption-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EncryptionExecution {
    return new EncryptionExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EncryptionExecution {
    return new EncryptionExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EncryptionExecution {
    return new EncryptionExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EncryptionExecution {
    if (this.data.tags.includes(tag)) return this;
    return new EncryptionExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EncryptionExecution {
    return new EncryptionExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EncryptionExecution {
    return new EncryptionExecution({
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

  toObject(): EncryptionExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
