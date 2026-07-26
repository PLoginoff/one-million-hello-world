/**
 * AuthorizationExecution Entity
 *
 * Tracks a single authorization execution.
 */

export interface AuthorizationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AuthorizationExecution {
  readonly data: AuthorizationExecutionData;

  private constructor(data: AuthorizationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AuthorizationExecution {
    const now = Date.now();
    return new AuthorizationExecution({
      id: 'authorization-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AuthorizationExecution {
    return new AuthorizationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AuthorizationExecution {
    return new AuthorizationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AuthorizationExecution {
    return new AuthorizationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AuthorizationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new AuthorizationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AuthorizationExecution {
    return new AuthorizationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AuthorizationExecution {
    return new AuthorizationExecution({
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

  toObject(): AuthorizationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
