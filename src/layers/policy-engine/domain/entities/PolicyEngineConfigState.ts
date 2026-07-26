/**
 * PolicyEngineConfigState Entity
 */

export interface PolicyEngineConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PolicyEngineConfigState {
  readonly data: PolicyEngineConfigStateData;

  private constructor(data: PolicyEngineConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): PolicyEngineConfigState {
    const now = Date.now();
    return new PolicyEngineConfigState({
      id: 'policy-engine-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): PolicyEngineConfigState {
    return new PolicyEngineConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): PolicyEngineConfigState {
    return new PolicyEngineConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): PolicyEngineConfigState {
    return new PolicyEngineConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): PolicyEngineConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new PolicyEngineConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): PolicyEngineConfigState {
    return new PolicyEngineConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): PolicyEngineConfigState {
    return new PolicyEngineConfigState({
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

  toObject(): PolicyEngineConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
