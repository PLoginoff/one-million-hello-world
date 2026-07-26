/**
 * CanaryDeployExecution Entity
 *
 * Tracks a single canary-deploy execution.
 */

export interface CanaryDeployExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CanaryDeployExecution {
  readonly data: CanaryDeployExecutionData;

  private constructor(data: CanaryDeployExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CanaryDeployExecution {
    const now = Date.now();
    return new CanaryDeployExecution({
      id: 'canary-deploy-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CanaryDeployExecution {
    return new CanaryDeployExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CanaryDeployExecution {
    return new CanaryDeployExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CanaryDeployExecution {
    return new CanaryDeployExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CanaryDeployExecution {
    if (this.data.tags.includes(tag)) return this;
    return new CanaryDeployExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CanaryDeployExecution {
    return new CanaryDeployExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CanaryDeployExecution {
    return new CanaryDeployExecution({
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

  toObject(): CanaryDeployExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
