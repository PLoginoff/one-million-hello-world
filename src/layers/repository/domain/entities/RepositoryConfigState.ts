/**
 * RepositoryConfigState Entity
 */

export interface RepositoryConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RepositoryConfigState {
  readonly data: RepositoryConfigStateData;

  private constructor(data: RepositoryConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): RepositoryConfigState {
    const now = Date.now();
    return new RepositoryConfigState({
      id: 'repository-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): RepositoryConfigState {
    return new RepositoryConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): RepositoryConfigState {
    return new RepositoryConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): RepositoryConfigState {
    return new RepositoryConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): RepositoryConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new RepositoryConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): RepositoryConfigState {
    return new RepositoryConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): RepositoryConfigState {
    return new RepositoryConfigState({
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

  toObject(): RepositoryConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
