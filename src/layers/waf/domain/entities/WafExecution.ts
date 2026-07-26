/**
 * WafExecution Entity
 *
 * Tracks a single waf execution.
 */

export interface WafExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WafExecution {
  readonly data: WafExecutionData;

  private constructor(data: WafExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WafExecution {
    const now = Date.now();
    return new WafExecution({
      id: 'waf-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WafExecution {
    return new WafExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WafExecution {
    return new WafExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WafExecution {
    return new WafExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WafExecution {
    if (this.data.tags.includes(tag)) return this;
    return new WafExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WafExecution {
    return new WafExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WafExecution {
    return new WafExecution({ ...this.data, attributes: { ...this.data.attributes, ...attrs }, updatedAt: Date.now() });
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

  toObject(): WafExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
