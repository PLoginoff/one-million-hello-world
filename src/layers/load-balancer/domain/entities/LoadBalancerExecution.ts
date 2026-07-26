/**
 * LoadBalancerExecution Entity
 *
 * Tracks a single load-balancer execution.
 */

export interface LoadBalancerExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LoadBalancerExecution {
  readonly data: LoadBalancerExecutionData;

  private constructor(data: LoadBalancerExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): LoadBalancerExecution {
    const now = Date.now();
    return new LoadBalancerExecution({
      id: 'load-balancer-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): LoadBalancerExecution {
    return new LoadBalancerExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): LoadBalancerExecution {
    return new LoadBalancerExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): LoadBalancerExecution {
    return new LoadBalancerExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): LoadBalancerExecution {
    if (this.data.tags.includes(tag)) return this;
    return new LoadBalancerExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): LoadBalancerExecution {
    return new LoadBalancerExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): LoadBalancerExecution {
    return new LoadBalancerExecution({
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

  toObject(): LoadBalancerExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
