/**
 * StreamProcessingExecution Entity
 *
 * Tracks a single stream-processing execution.
 */

export interface StreamProcessingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StreamProcessingExecution {
  readonly data: StreamProcessingExecutionData;

  private constructor(data: StreamProcessingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): StreamProcessingExecution {
    const now = Date.now();
    return new StreamProcessingExecution({
      id: 'stream-processing-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): StreamProcessingExecution {
    return new StreamProcessingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): StreamProcessingExecution {
    return new StreamProcessingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): StreamProcessingExecution {
    return new StreamProcessingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): StreamProcessingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new StreamProcessingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): StreamProcessingExecution {
    return new StreamProcessingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): StreamProcessingExecution {
    return new StreamProcessingExecution({
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

  toObject(): StreamProcessingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
