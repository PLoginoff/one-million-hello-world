/**
 * ApiGatewayExecution Entity
 *
 * Tracks a single api-gateway execution.
 */

export interface ApiGatewayExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ApiGatewayExecution {
  readonly data: ApiGatewayExecutionData;

  private constructor(data: ApiGatewayExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ApiGatewayExecution {
    const now = Date.now();
    return new ApiGatewayExecution({
      id: 'api-gateway-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ApiGatewayExecution {
    return new ApiGatewayExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ApiGatewayExecution {
    return new ApiGatewayExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ApiGatewayExecution {
    return new ApiGatewayExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ApiGatewayExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ApiGatewayExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ApiGatewayExecution {
    return new ApiGatewayExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ApiGatewayExecution {
    return new ApiGatewayExecution({
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

  toObject(): ApiGatewayExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
