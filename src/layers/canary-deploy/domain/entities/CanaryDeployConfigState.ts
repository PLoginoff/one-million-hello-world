/**
 * CanaryDeployConfigState Entity
 */

export interface CanaryDeployConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CanaryDeployConfigState {
  readonly data: CanaryDeployConfigStateData;

  private constructor(data: CanaryDeployConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CanaryDeployConfigState {
    const now = Date.now();
    return new CanaryDeployConfigState({
      id: 'canary-deploy-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CanaryDeployConfigState {
    return new CanaryDeployConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CanaryDeployConfigState {
    return new CanaryDeployConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CanaryDeployConfigState {
    return new CanaryDeployConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CanaryDeployConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new CanaryDeployConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CanaryDeployConfigState {
    return new CanaryDeployConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CanaryDeployConfigState {
    return new CanaryDeployConfigState({
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

  toObject(): CanaryDeployConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
