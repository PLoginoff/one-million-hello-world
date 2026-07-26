/**
 * DataWarehouseExecution Entity
 *
 * Tracks a single data-warehouse execution.
 */

export interface DataWarehouseExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataWarehouseExecution {
  readonly data: DataWarehouseExecutionData;

  private constructor(data: DataWarehouseExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): DataWarehouseExecution {
    const now = Date.now();
    return new DataWarehouseExecution({
      id: 'data-warehouse-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): DataWarehouseExecution {
    return new DataWarehouseExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): DataWarehouseExecution {
    return new DataWarehouseExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): DataWarehouseExecution {
    return new DataWarehouseExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): DataWarehouseExecution {
    if (this.data.tags.includes(tag)) return this;
    return new DataWarehouseExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): DataWarehouseExecution {
    return new DataWarehouseExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): DataWarehouseExecution {
    return new DataWarehouseExecution({
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

  toObject(): DataWarehouseExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
