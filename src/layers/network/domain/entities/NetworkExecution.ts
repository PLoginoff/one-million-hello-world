/**
 * NetworkExecution Entity
 *
 * Tracks a single network execution.
 */

export interface NetworkExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class NetworkExecution {
  readonly data: NetworkExecutionData;

  private constructor(data: NetworkExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): NetworkExecution {
    const now = Date.now();
    return new NetworkExecution({
      id: 'network-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): NetworkExecution {
    return new NetworkExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): NetworkExecution {
    return new NetworkExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): NetworkExecution {
    return new NetworkExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): NetworkExecution {
    if (this.data.tags.includes(tag)) return this;
    return new NetworkExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): NetworkExecution {
    return new NetworkExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NetworkExecution {
    return new NetworkExecution({
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

  toObject(): NetworkExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
