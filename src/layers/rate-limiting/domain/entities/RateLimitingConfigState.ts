/**
 * RateLimitingConfigState Entity
 */

export interface RateLimitingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RateLimitingConfigState {
  readonly data: RateLimitingConfigStateData;

  private constructor(data: RateLimitingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RateLimitingConfigState {
    const now = Date.now();
    return new RateLimitingConfigState({
      id: 'rate-limiting-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RateLimitingConfigState {
    return new RateLimitingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RateLimitingConfigState {
    return new RateLimitingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RateLimitingConfigState {
    return new RateLimitingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RateLimitingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new RateLimitingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RateLimitingConfigState {
    return new RateLimitingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RateLimitingConfigState {
    return new RateLimitingConfigState({
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

  toObject(): RateLimitingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
