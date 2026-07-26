/**
 * BlueGreenDeployConfigState Entity
 */

export interface BlueGreenDeployConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BlueGreenDeployConfigState {
  readonly data: BlueGreenDeployConfigStateData;

  private constructor(data: BlueGreenDeployConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): BlueGreenDeployConfigState {
    const now = Date.now();
    return new BlueGreenDeployConfigState({
      id: 'blue-green-deploy-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): BlueGreenDeployConfigState {
    return new BlueGreenDeployConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): BlueGreenDeployConfigState {
    return new BlueGreenDeployConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): BlueGreenDeployConfigState {
    return new BlueGreenDeployConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): BlueGreenDeployConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new BlueGreenDeployConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): BlueGreenDeployConfigState {
    return new BlueGreenDeployConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): BlueGreenDeployConfigState {
    return new BlueGreenDeployConfigState({
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

  toObject(): BlueGreenDeployConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
