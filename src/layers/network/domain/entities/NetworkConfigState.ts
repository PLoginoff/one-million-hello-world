/**
 * NetworkConfigState Entity
 */

export interface NetworkConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class NetworkConfigState {
  readonly data: NetworkConfigStateData;

  private constructor(data: NetworkConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): NetworkConfigState {
    const now = Date.now();
    return new NetworkConfigState({
      id: 'network-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): NetworkConfigState {
    return new NetworkConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): NetworkConfigState {
    return new NetworkConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): NetworkConfigState {
    return new NetworkConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): NetworkConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new NetworkConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): NetworkConfigState {
    return new NetworkConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NetworkConfigState {
    return new NetworkConfigState({
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

  toObject(): NetworkConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
