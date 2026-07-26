/**
 * EdgeCacheConfigState Entity
 */

export interface EdgeCacheConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EdgeCacheConfigState {
  readonly data: EdgeCacheConfigStateData;

  private constructor(data: EdgeCacheConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EdgeCacheConfigState {
    const now = Date.now();
    return new EdgeCacheConfigState({
      id: 'edge-cache-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EdgeCacheConfigState {
    return new EdgeCacheConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EdgeCacheConfigState {
    return new EdgeCacheConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EdgeCacheConfigState {
    return new EdgeCacheConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EdgeCacheConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new EdgeCacheConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EdgeCacheConfigState {
    return new EdgeCacheConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EdgeCacheConfigState {
    return new EdgeCacheConfigState({
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

  toObject(): EdgeCacheConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
