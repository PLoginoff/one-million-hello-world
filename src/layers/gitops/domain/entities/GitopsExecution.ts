/**
 * GitopsExecution Entity
 *
 * Tracks a single gitops execution.
 */

export interface GitopsExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GitopsExecution {
  readonly data: GitopsExecutionData;

  private constructor(data: GitopsExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GitopsExecution {
    const now = Date.now();
    return new GitopsExecution({
      id: 'gitops-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GitopsExecution {
    return new GitopsExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GitopsExecution {
    return new GitopsExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GitopsExecution {
    return new GitopsExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GitopsExecution {
    if (this.data.tags.includes(tag)) return this;
    return new GitopsExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GitopsExecution {
    return new GitopsExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GitopsExecution {
    return new GitopsExecution({
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

  toObject(): GitopsExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
