/**
 * EtlPipelineExecution Entity
 *
 * Tracks a single etl-pipeline execution.
 */

export interface EtlPipelineExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EtlPipelineExecution {
  readonly data: EtlPipelineExecutionData;

  private constructor(data: EtlPipelineExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EtlPipelineExecution {
    const now = Date.now();
    return new EtlPipelineExecution({
      id: 'etl-pipeline-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EtlPipelineExecution {
    return new EtlPipelineExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EtlPipelineExecution {
    return new EtlPipelineExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EtlPipelineExecution {
    return new EtlPipelineExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EtlPipelineExecution {
    if (this.data.tags.includes(tag)) return this;
    return new EtlPipelineExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EtlPipelineExecution {
    return new EtlPipelineExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EtlPipelineExecution {
    return new EtlPipelineExecution({
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

  toObject(): EtlPipelineExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
