/**
 * SpecificationExecution Entity
 *
 * Tracks a single specification execution.
 */

export interface SpecificationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SpecificationExecution {
  readonly data: SpecificationExecutionData;

  private constructor(data: SpecificationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SpecificationExecution {
    const now = Date.now();
    return new SpecificationExecution({
      id: 'specification-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SpecificationExecution {
    return new SpecificationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SpecificationExecution {
    return new SpecificationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SpecificationExecution {
    return new SpecificationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SpecificationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SpecificationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SpecificationExecution {
    return new SpecificationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SpecificationExecution {
    return new SpecificationExecution({
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

  toObject(): SpecificationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
