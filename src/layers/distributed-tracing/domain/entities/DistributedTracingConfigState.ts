/**
 * DistributedTracingConfigState Entity
 */

export interface DistributedTracingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DistributedTracingConfigState {
  readonly data: DistributedTracingConfigStateData;

  private constructor(data: DistributedTracingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DistributedTracingConfigState {
    const now = Date.now();
    return new DistributedTracingConfigState({
      id: 'distributed-tracing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DistributedTracingConfigState {
    return new DistributedTracingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DistributedTracingConfigState {
    return new DistributedTracingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DistributedTracingConfigState {
    return new DistributedTracingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DistributedTracingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new DistributedTracingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DistributedTracingConfigState {
    return new DistributedTracingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DistributedTracingConfigState {
    return new DistributedTracingConfigState({
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

  toObject(): DistributedTracingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
