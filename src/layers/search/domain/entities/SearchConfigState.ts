/**
 * SearchConfigState Entity
 */

export interface SearchConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SearchConfigState {
  readonly data: SearchConfigStateData;

  private constructor(data: SearchConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SearchConfigState {
    const now = Date.now();
    return new SearchConfigState({
      id: 'search-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SearchConfigState {
    return new SearchConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SearchConfigState {
    return new SearchConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SearchConfigState {
    return new SearchConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SearchConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SearchConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SearchConfigState {
    return new SearchConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SearchConfigState {
    return new SearchConfigState({
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

  toObject(): SearchConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
