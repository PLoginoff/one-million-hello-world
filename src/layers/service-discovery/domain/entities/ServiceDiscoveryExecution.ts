/**
 * ServiceDiscoveryExecution Entity
 *
 * Tracks a single service-discovery execution.
 */

export interface ServiceDiscoveryExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceDiscoveryExecution {
  readonly data: ServiceDiscoveryExecutionData;

  private constructor(data: ServiceDiscoveryExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ServiceDiscoveryExecution {
    const now = Date.now();
    return new ServiceDiscoveryExecution({
      id: 'service-discovery-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ServiceDiscoveryExecution {
    return new ServiceDiscoveryExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ServiceDiscoveryExecution {
    return new ServiceDiscoveryExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ServiceDiscoveryExecution {
    return new ServiceDiscoveryExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ServiceDiscoveryExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ServiceDiscoveryExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ServiceDiscoveryExecution {
    return new ServiceDiscoveryExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ServiceDiscoveryExecution {
    return new ServiceDiscoveryExecution({
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

  toObject(): ServiceDiscoveryExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
