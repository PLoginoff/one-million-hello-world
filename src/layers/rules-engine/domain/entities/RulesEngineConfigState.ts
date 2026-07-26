/**
 * RulesEngineConfigState Entity
 */

export interface RulesEngineConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RulesEngineConfigState {
  readonly data: RulesEngineConfigStateData;

  private constructor(data: RulesEngineConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RulesEngineConfigState {
    const now = Date.now();
    return new RulesEngineConfigState({
      id: 'rules-engine-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RulesEngineConfigState {
    return new RulesEngineConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RulesEngineConfigState {
    return new RulesEngineConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RulesEngineConfigState {
    return new RulesEngineConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RulesEngineConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new RulesEngineConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RulesEngineConfigState {
    return new RulesEngineConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RulesEngineConfigState {
    return new RulesEngineConfigState({
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

  toObject(): RulesEngineConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
