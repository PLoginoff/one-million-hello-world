/**
 * SchemaRegistryExecution Entity
 *
 * Tracks a single schema-registry execution.
 */

export interface SchemaRegistryExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SchemaRegistryExecution {
  readonly data: SchemaRegistryExecutionData;

  private constructor(data: SchemaRegistryExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SchemaRegistryExecution {
    const now = Date.now();
    return new SchemaRegistryExecution({
      id: 'schema-registry-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SchemaRegistryExecution {
    return new SchemaRegistryExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SchemaRegistryExecution {
    return new SchemaRegistryExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SchemaRegistryExecution {
    return new SchemaRegistryExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SchemaRegistryExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SchemaRegistryExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SchemaRegistryExecution {
    return new SchemaRegistryExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SchemaRegistryExecution {
    return new SchemaRegistryExecution({
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

  toObject(): SchemaRegistryExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
