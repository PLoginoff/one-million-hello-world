/**
 * Oauth2Execution Entity
 *
 * Tracks a single oauth2 execution.
 */

export interface Oauth2ExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class Oauth2Execution {
  readonly data: Oauth2ExecutionData;

  private constructor(data: Oauth2ExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): Oauth2Execution {
    const now = Date.now();
    return new Oauth2Execution({
      id: 'oauth2-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): Oauth2Execution {
    return new Oauth2Execution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): Oauth2Execution {
    return new Oauth2Execution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): Oauth2Execution {
    return new Oauth2Execution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): Oauth2Execution {
    if (this.data.tags.includes(tag)) return this;
    return new Oauth2Execution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): Oauth2Execution {
    return new Oauth2Execution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): Oauth2Execution {
    return new Oauth2Execution({
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

  toObject(): Oauth2ExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
