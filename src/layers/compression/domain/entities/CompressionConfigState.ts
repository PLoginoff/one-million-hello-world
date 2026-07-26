/**
 * CompressionConfigState Entity
 */

export interface CompressionConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CompressionConfigState {
  readonly data: CompressionConfigStateData;

  private constructor(data: CompressionConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): CompressionConfigState {
    const now = Date.now();
    return new CompressionConfigState({
      id: 'compression-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): CompressionConfigState {
    return new CompressionConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): CompressionConfigState {
    return new CompressionConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): CompressionConfigState {
    return new CompressionConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): CompressionConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new CompressionConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): CompressionConfigState {
    return new CompressionConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): CompressionConfigState {
    return new CompressionConfigState({
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

  toObject(): CompressionConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
