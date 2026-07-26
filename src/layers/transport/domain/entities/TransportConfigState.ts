/**
 * TransportConfigState Entity
 */

export interface TransportConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class TransportConfigState {
  readonly data: TransportConfigStateData;

  private constructor(data: TransportConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): TransportConfigState {
    const now = Date.now();
    return new TransportConfigState({
      id: 'transport-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): TransportConfigState {
    return new TransportConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): TransportConfigState {
    return new TransportConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): TransportConfigState {
    return new TransportConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): TransportConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new TransportConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): TransportConfigState {
    return new TransportConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): TransportConfigState {
    return new TransportConfigState({
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

  toObject(): TransportConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
