/**
 * ServiceMeshConfigState Entity
 */

export interface ServiceMeshConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceMeshConfigState {
  readonly data: ServiceMeshConfigStateData;

  private constructor(data: ServiceMeshConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ServiceMeshConfigState {
    const now = Date.now();
    return new ServiceMeshConfigState({
      id: 'service-mesh-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ServiceMeshConfigState {
    return new ServiceMeshConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ServiceMeshConfigState {
    return new ServiceMeshConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ServiceMeshConfigState {
    return new ServiceMeshConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ServiceMeshConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ServiceMeshConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ServiceMeshConfigState {
    return new ServiceMeshConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ServiceMeshConfigState {
    return new ServiceMeshConfigState({
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

  toObject(): ServiceMeshConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
