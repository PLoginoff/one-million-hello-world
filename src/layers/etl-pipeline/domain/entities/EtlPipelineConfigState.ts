/**
 * EtlPipelineConfigState Entity
 */

export interface EtlPipelineConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class EtlPipelineConfigState {
  readonly data: EtlPipelineConfigStateData;

  private constructor(data: EtlPipelineConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): EtlPipelineConfigState {
    const now = Date.now();
    return new EtlPipelineConfigState({
      id: 'etl-pipeline-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): EtlPipelineConfigState {
    return new EtlPipelineConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): EtlPipelineConfigState {
    return new EtlPipelineConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): EtlPipelineConfigState {
    return new EtlPipelineConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): EtlPipelineConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new EtlPipelineConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): EtlPipelineConfigState {
    return new EtlPipelineConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): EtlPipelineConfigState {
    return new EtlPipelineConfigState({
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

  toObject(): EtlPipelineConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
