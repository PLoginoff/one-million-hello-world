/**
 * JwtValidationExecution Entity
 *
 * Tracks a single jwt-validation execution.
 */

export interface JwtValidationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class JwtValidationExecution {
  readonly data: JwtValidationExecutionData;

  private constructor(data: JwtValidationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): JwtValidationExecution {
    const now = Date.now();
    return new JwtValidationExecution({
      id: 'jwt-validation-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): JwtValidationExecution {
    return new JwtValidationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): JwtValidationExecution {
    return new JwtValidationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): JwtValidationExecution {
    return new JwtValidationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): JwtValidationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new JwtValidationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): JwtValidationExecution {
    return new JwtValidationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): JwtValidationExecution {
    return new JwtValidationExecution({
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

  toObject(): JwtValidationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
