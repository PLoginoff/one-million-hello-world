/**
 * RepositoryExecution Entity
 *
 * Tracks a single repository execution.
 */

export interface RepositoryExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RepositoryExecution {
  readonly data: RepositoryExecutionData;

  private constructor(data: RepositoryExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RepositoryExecution {
    const now = Date.now();
    return new RepositoryExecution({
      id: 'repository-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RepositoryExecution {
    return new RepositoryExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RepositoryExecution {
    return new RepositoryExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RepositoryExecution {
    return new RepositoryExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RepositoryExecution {
    if (this.data.tags.includes(tag)) return this;
    return new RepositoryExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RepositoryExecution {
    return new RepositoryExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RepositoryExecution {
    return new RepositoryExecution({
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

  toObject(): RepositoryExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
