/**
 * WriteModelConfigState Entity
 */

export interface WriteModelConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WriteModelConfigState {
  readonly data: WriteModelConfigStateData;

  private constructor(data: WriteModelConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WriteModelConfigState {
    const now = Date.now();
    return new WriteModelConfigState({
      id: 'write-model-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WriteModelConfigState {
    return new WriteModelConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WriteModelConfigState {
    return new WriteModelConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WriteModelConfigState {
    return new WriteModelConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WriteModelConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new WriteModelConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WriteModelConfigState {
    return new WriteModelConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WriteModelConfigState {
    return new WriteModelConfigState({
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

  toObject(): WriteModelConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
