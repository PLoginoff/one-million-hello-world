/**
 * MigrationsConfigState Entity
 */

export interface MigrationsConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MigrationsConfigState {
  readonly data: MigrationsConfigStateData;

  private constructor(data: MigrationsConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): MigrationsConfigState {
    const now = Date.now();
    return new MigrationsConfigState({
      id: 'migrations-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): MigrationsConfigState {
    return new MigrationsConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): MigrationsConfigState {
    return new MigrationsConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): MigrationsConfigState {
    return new MigrationsConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): MigrationsConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new MigrationsConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): MigrationsConfigState {
    return new MigrationsConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): MigrationsConfigState {
    return new MigrationsConfigState({
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

  toObject(): MigrationsConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
