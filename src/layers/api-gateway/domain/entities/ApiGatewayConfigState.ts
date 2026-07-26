/**
 * ApiGatewayConfigState Entity
 */

export interface ApiGatewayConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ApiGatewayConfigState {
  readonly data: ApiGatewayConfigStateData;

  private constructor(data: ApiGatewayConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ApiGatewayConfigState {
    const now = Date.now();
    return new ApiGatewayConfigState({
      id: 'api-gateway-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ApiGatewayConfigState {
    return new ApiGatewayConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ApiGatewayConfigState {
    return new ApiGatewayConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ApiGatewayConfigState {
    return new ApiGatewayConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ApiGatewayConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new ApiGatewayConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ApiGatewayConfigState {
    return new ApiGatewayConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ApiGatewayConfigState {
    return new ApiGatewayConfigState({
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

  toObject(): ApiGatewayConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
