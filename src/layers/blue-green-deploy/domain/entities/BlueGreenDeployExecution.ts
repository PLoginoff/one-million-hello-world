/**
 * BlueGreenDeployExecution Entity
 *
 * Tracks a single blue-green-deploy execution.
 */

export interface BlueGreenDeployExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BlueGreenDeployExecution {
  readonly data: BlueGreenDeployExecutionData;

  private constructor(data: BlueGreenDeployExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BlueGreenDeployExecution {
    const now = Date.now();
    return new BlueGreenDeployExecution({
      id: 'blue-green-deploy-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BlueGreenDeployExecution {
    return new BlueGreenDeployExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BlueGreenDeployExecution {
    return new BlueGreenDeployExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BlueGreenDeployExecution {
    return new BlueGreenDeployExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BlueGreenDeployExecution {
    if (this.data.tags.includes(tag)) return this;
    return new BlueGreenDeployExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BlueGreenDeployExecution {
    return new BlueGreenDeployExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BlueGreenDeployExecution {
    return new BlueGreenDeployExecution({
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

  toObject(): BlueGreenDeployExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
