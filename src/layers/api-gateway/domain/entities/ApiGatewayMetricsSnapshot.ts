/**
 * ApiGatewayMetricsSnapshot Entity
 */

export interface ApiGatewayMetricsSnapshotData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ApiGatewayMetricsSnapshot {
  readonly data: ApiGatewayMetricsSnapshotData;

  private constructor(data: ApiGatewayMetricsSnapshotData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ApiGatewayMetricsSnapshot {
    const now = Date.now();
    return new ApiGatewayMetricsSnapshot({
      id: 'api-gateway-mtr-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ApiGatewayMetricsSnapshot {
    return new ApiGatewayMetricsSnapshot({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ApiGatewayMetricsSnapshot {
    return new ApiGatewayMetricsSnapshot({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ApiGatewayMetricsSnapshot {
    return new ApiGatewayMetricsSnapshot({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ApiGatewayMetricsSnapshot {
    if (this.data.tags.includes(tag)) return this;
    return new ApiGatewayMetricsSnapshot({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ApiGatewayMetricsSnapshot {
    return new ApiGatewayMetricsSnapshot({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ApiGatewayMetricsSnapshot {
    return new ApiGatewayMetricsSnapshot({
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

  toObject(): ApiGatewayMetricsSnapshotData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
