/**
 * WebsocketExecution Entity
 *
 * Tracks a single websocket execution.
 */

export interface WebsocketExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WebsocketExecution {
  readonly data: WebsocketExecutionData;

  private constructor(data: WebsocketExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WebsocketExecution {
    const now = Date.now();
    return new WebsocketExecution({
      id: 'websocket-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WebsocketExecution {
    return new WebsocketExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WebsocketExecution {
    return new WebsocketExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WebsocketExecution {
    return new WebsocketExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WebsocketExecution {
    if (this.data.tags.includes(tag)) return this;
    return new WebsocketExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WebsocketExecution {
    return new WebsocketExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WebsocketExecution {
    return new WebsocketExecution({
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

  toObject(): WebsocketExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
