/**
 * LocalizationExecution Entity
 *
 * Tracks a single localization execution.
 */

export interface LocalizationExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LocalizationExecution {
  readonly data: LocalizationExecutionData;

  private constructor(data: LocalizationExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): LocalizationExecution {
    const now = Date.now();
    return new LocalizationExecution({
      id: 'localization-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): LocalizationExecution {
    return new LocalizationExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): LocalizationExecution {
    return new LocalizationExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): LocalizationExecution {
    return new LocalizationExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): LocalizationExecution {
    if (this.data.tags.includes(tag)) return this;
    return new LocalizationExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): LocalizationExecution {
    return new LocalizationExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): LocalizationExecution {
    return new LocalizationExecution({
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

  toObject(): LocalizationExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
