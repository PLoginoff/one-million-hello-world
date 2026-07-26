/**
 * WorkflowEngineExecution Entity
 *
 * Tracks a single workflow-engine execution.
 */

export interface WorkflowEngineExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WorkflowEngineExecution {
  readonly data: WorkflowEngineExecutionData;

  private constructor(data: WorkflowEngineExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): WorkflowEngineExecution {
    const now = Date.now();
    return new WorkflowEngineExecution({
      id: 'workflow-engine-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): WorkflowEngineExecution {
    return new WorkflowEngineExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): WorkflowEngineExecution {
    return new WorkflowEngineExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): WorkflowEngineExecution {
    return new WorkflowEngineExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): WorkflowEngineExecution {
    if (this.data.tags.includes(tag)) return this;
    return new WorkflowEngineExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): WorkflowEngineExecution {
    return new WorkflowEngineExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): WorkflowEngineExecution {
    return new WorkflowEngineExecution({
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

  toObject(): WorkflowEngineExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
