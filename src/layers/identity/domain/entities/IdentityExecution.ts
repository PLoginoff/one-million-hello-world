/**
 * IdentityExecution Entity
 *
 * Tracks a single identity execution.
 */

export interface IdentityExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class IdentityExecution {
  readonly data: IdentityExecutionData;

  private constructor(data: IdentityExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): IdentityExecution {
    const now = Date.now();
    return new IdentityExecution({
      id: 'identity-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): IdentityExecution {
    return new IdentityExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): IdentityExecution {
    return new IdentityExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): IdentityExecution {
    return new IdentityExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): IdentityExecution {
    if (this.data.tags.includes(tag)) return this;
    return new IdentityExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): IdentityExecution {
    return new IdentityExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): IdentityExecution {
    return new IdentityExecution({
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

  toObject(): IdentityExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
