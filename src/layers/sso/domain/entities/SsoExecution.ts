/**
 * SsoExecution Entity
 *
 * Tracks a single sso execution.
 */

export interface SsoExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SsoExecution {
  readonly data: SsoExecutionData;

  private constructor(data: SsoExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SsoExecution {
    const now = Date.now();
    return new SsoExecution({
      id: 'sso-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SsoExecution {
    return new SsoExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SsoExecution {
    return new SsoExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SsoExecution {
    return new SsoExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SsoExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SsoExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SsoExecution {
    return new SsoExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SsoExecution {
    return new SsoExecution({ ...this.data, attributes: { ...this.data.attributes, ...attrs }, updatedAt: Date.now() });
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

  toObject(): SsoExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
