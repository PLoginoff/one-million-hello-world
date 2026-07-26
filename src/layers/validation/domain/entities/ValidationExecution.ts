/**
 * ValidationExecution Entity
 *
 * Tracks a single validation execution.
 */

export interface ValidationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ValidationExecution {
  readonly data: ValidationExecutionData;

  private constructor(data: ValidationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ValidationExecution {
    const now = Date.now();
    return new ValidationExecution({
      id: 'validation-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ValidationExecution {
    return new ValidationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ValidationExecution {
    return new ValidationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ValidationExecution {
    return new ValidationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ValidationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ValidationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ValidationExecution {
    return new ValidationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ValidationExecution {
    return new ValidationExecution({
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

  toObject(): ValidationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
