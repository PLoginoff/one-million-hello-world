/**
 * CacheConfigState Entity
 */

export interface CacheConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CacheConfigState {
  readonly data: CacheConfigStateData;

  private constructor(data: CacheConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CacheConfigState {
    const now = Date.now();
    return new CacheConfigState({
      id: 'cache-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CacheConfigState {
    return new CacheConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CacheConfigState {
    return new CacheConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CacheConfigState {
    return new CacheConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CacheConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new CacheConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CacheConfigState {
    return new CacheConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CacheConfigState {
    return new CacheConfigState({
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

  toObject(): CacheConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
