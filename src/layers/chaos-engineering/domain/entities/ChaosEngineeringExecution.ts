/**
 * ChaosEngineeringExecution Entity
 *
 * Tracks a single chaos-engineering execution.
 */

export interface ChaosEngineeringExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ChaosEngineeringExecution {
  readonly data: ChaosEngineeringExecutionData;

  private constructor(data: ChaosEngineeringExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ChaosEngineeringExecution {
    const now = Date.now();
    return new ChaosEngineeringExecution({
      id: 'chaos-engineering-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ChaosEngineeringExecution {
    return new ChaosEngineeringExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ChaosEngineeringExecution {
    return new ChaosEngineeringExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ChaosEngineeringExecution {
    return new ChaosEngineeringExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ChaosEngineeringExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ChaosEngineeringExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ChaosEngineeringExecution {
    return new ChaosEngineeringExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ChaosEngineeringExecution {
    return new ChaosEngineeringExecution({
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

  toObject(): ChaosEngineeringExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
