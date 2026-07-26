/**
 * ServiceMeshExecution Entity
 *
 * Tracks a single service-mesh execution.
 */

export interface ServiceMeshExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceMeshExecution {
  readonly data: ServiceMeshExecutionData;

  private constructor(data: ServiceMeshExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ServiceMeshExecution {
    const now = Date.now();
    return new ServiceMeshExecution({
      id: 'service-mesh-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ServiceMeshExecution {
    return new ServiceMeshExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ServiceMeshExecution {
    return new ServiceMeshExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ServiceMeshExecution {
    return new ServiceMeshExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ServiceMeshExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ServiceMeshExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ServiceMeshExecution {
    return new ServiceMeshExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ServiceMeshExecution {
    return new ServiceMeshExecution({
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

  toObject(): ServiceMeshExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
