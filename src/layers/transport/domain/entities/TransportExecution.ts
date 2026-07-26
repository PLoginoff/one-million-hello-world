/**
 * TransportExecution Entity
 *
 * Tracks a single transport execution.
 */

export interface TransportExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class TransportExecution {
  readonly data: TransportExecutionData;

  private constructor(data: TransportExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): TransportExecution {
    const now = Date.now();
    return new TransportExecution({
      id: 'transport-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): TransportExecution {
    return new TransportExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): TransportExecution {
    return new TransportExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): TransportExecution {
    return new TransportExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): TransportExecution {
    if (this.data.tags.includes(tag)) return this;
    return new TransportExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): TransportExecution {
    return new TransportExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): TransportExecution {
    return new TransportExecution({
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

  toObject(): TransportExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
