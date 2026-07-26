/**
 * GitopsConfigState Entity
 */

export interface GitopsConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class GitopsConfigState {
  readonly data: GitopsConfigStateData;

  private constructor(data: GitopsConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): GitopsConfigState {
    const now = Date.now();
    return new GitopsConfigState({
      id: 'gitops-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): GitopsConfigState {
    return new GitopsConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): GitopsConfigState {
    return new GitopsConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): GitopsConfigState {
    return new GitopsConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): GitopsConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new GitopsConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): GitopsConfigState {
    return new GitopsConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): GitopsConfigState {
    return new GitopsConfigState({
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

  toObject(): GitopsConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
