/**
 * SecretsExecution Entity
 *
 * Tracks a single secrets execution.
 */

export interface SecretsExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecretsExecution {
  readonly data: SecretsExecutionData;

  private constructor(data: SecretsExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SecretsExecution {
    const now = Date.now();
    return new SecretsExecution({
      id: 'secrets-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SecretsExecution {
    return new SecretsExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SecretsExecution {
    return new SecretsExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SecretsExecution {
    return new SecretsExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SecretsExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SecretsExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SecretsExecution {
    return new SecretsExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecretsExecution {
    return new SecretsExecution({
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

  toObject(): SecretsExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
