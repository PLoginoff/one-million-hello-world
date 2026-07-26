/**
 * SiemExecution Entity
 *
 * Tracks a single siem execution.
 */

export interface SiemExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SiemExecution {
  readonly data: SiemExecutionData;

  private constructor(data: SiemExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): SiemExecution {
    const now = Date.now();
    return new SiemExecution({
      id: 'siem-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): SiemExecution {
    return new SiemExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): SiemExecution {
    return new SiemExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): SiemExecution {
    return new SiemExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): SiemExecution {
    if (this.data.tags.includes(tag)) return this;
    return new SiemExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): SiemExecution {
    return new SiemExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SiemExecution {
    return new SiemExecution({
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

  toObject(): SiemExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
