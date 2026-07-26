/**
 * MutationTestingExecution Entity
 *
 * Tracks a single mutation-testing execution.
 */

export interface MutationTestingExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MutationTestingExecution {
  readonly data: MutationTestingExecutionData;

  private constructor(data: MutationTestingExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MutationTestingExecution {
    const now = Date.now();
    return new MutationTestingExecution({
      id: 'mutation-testing-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MutationTestingExecution {
    return new MutationTestingExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MutationTestingExecution {
    return new MutationTestingExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MutationTestingExecution {
    return new MutationTestingExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MutationTestingExecution {
    if (this.data.tags.includes(tag)) return this;
    return new MutationTestingExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MutationTestingExecution {
    return new MutationTestingExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MutationTestingExecution {
    return new MutationTestingExecution({
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

  toObject(): MutationTestingExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
