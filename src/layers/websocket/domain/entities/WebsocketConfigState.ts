/**
 * WebsocketConfigState Entity
 */

export interface WebsocketConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WebsocketConfigState {
  readonly data: WebsocketConfigStateData;

  private constructor(data: WebsocketConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WebsocketConfigState {
    const now = Date.now();
    return new WebsocketConfigState({
      id: 'websocket-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WebsocketConfigState {
    return new WebsocketConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WebsocketConfigState {
    return new WebsocketConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WebsocketConfigState {
    return new WebsocketConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WebsocketConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new WebsocketConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WebsocketConfigState {
    return new WebsocketConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WebsocketConfigState {
    return new WebsocketConfigState({
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

  toObject(): WebsocketConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
