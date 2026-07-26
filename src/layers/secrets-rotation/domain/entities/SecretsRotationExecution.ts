/**
 * SecretsRotationExecution Entity
 *
 * Tracks a single secrets-rotation execution.
 */

export interface SecretsRotationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecretsRotationExecution {
  readonly data: SecretsRotationExecutionData;

  private constructor(data: SecretsRotationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SecretsRotationExecution {
    const now = Date.now();
    return new SecretsRotationExecution({
      id: 'secrets-rotation-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SecretsRotationExecution {
    return new SecretsRotationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SecretsRotationExecution {
    return new SecretsRotationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SecretsRotationExecution {
    return new SecretsRotationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SecretsRotationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SecretsRotationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SecretsRotationExecution {
    return new SecretsRotationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SecretsRotationExecution {
    return new SecretsRotationExecution({
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

  toObject(): SecretsRotationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
