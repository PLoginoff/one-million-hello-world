/**
 * StrategyConfigState Entity
 */

export interface StrategyConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StrategyConfigState {
  readonly data: StrategyConfigStateData;

  private constructor(data: StrategyConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): StrategyConfigState {
    const now = Date.now();
    return new StrategyConfigState({
      id: 'strategy-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): StrategyConfigState {
    return new StrategyConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): StrategyConfigState {
    return new StrategyConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): StrategyConfigState {
    return new StrategyConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): StrategyConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new StrategyConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): StrategyConfigState {
    return new StrategyConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): StrategyConfigState {
    return new StrategyConfigState({
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

  toObject(): StrategyConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
