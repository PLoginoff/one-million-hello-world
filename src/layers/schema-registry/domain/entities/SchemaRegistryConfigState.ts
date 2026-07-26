/**
 * SchemaRegistryConfigState Entity
 */

export interface SchemaRegistryConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SchemaRegistryConfigState {
  readonly data: SchemaRegistryConfigStateData;

  private constructor(data: SchemaRegistryConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SchemaRegistryConfigState {
    const now = Date.now();
    return new SchemaRegistryConfigState({
      id: 'schema-registry-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SchemaRegistryConfigState {
    return new SchemaRegistryConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SchemaRegistryConfigState {
    return new SchemaRegistryConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SchemaRegistryConfigState {
    return new SchemaRegistryConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SchemaRegistryConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new SchemaRegistryConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SchemaRegistryConfigState {
    return new SchemaRegistryConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SchemaRegistryConfigState {
    return new SchemaRegistryConfigState({
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

  toObject(): SchemaRegistryConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
