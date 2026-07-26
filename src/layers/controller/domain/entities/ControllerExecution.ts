/**
 * ControllerExecution Entity
 *
 * Tracks a single controller execution.
 */

export interface ControllerExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ControllerExecution {
  readonly data: ControllerExecutionData;

  private constructor(data: ControllerExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): ControllerExecution {
    const now = Date.now();
    return new ControllerExecution({
      id: 'controller-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): ControllerExecution {
    return new ControllerExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): ControllerExecution {
    return new ControllerExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): ControllerExecution {
    return new ControllerExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): ControllerExecution {
    if (this.data.tags.includes(tag)) return this;
    return new ControllerExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): ControllerExecution {
    return new ControllerExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): ControllerExecution {
    return new ControllerExecution({
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

  toObject(): ControllerExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
