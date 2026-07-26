/**
 * StreamProcessingConfigState Entity
 */

export interface StreamProcessingConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StreamProcessingConfigState {
  readonly data: StreamProcessingConfigStateData;

  private constructor(data: StreamProcessingConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): StreamProcessingConfigState {
    const now = Date.now();
    return new StreamProcessingConfigState({
      id: 'stream-processing-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): StreamProcessingConfigState {
    return new StreamProcessingConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): StreamProcessingConfigState {
    return new StreamProcessingConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): StreamProcessingConfigState {
    return new StreamProcessingConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): StreamProcessingConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new StreamProcessingConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): StreamProcessingConfigState {
    return new StreamProcessingConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): StreamProcessingConfigState {
    return new StreamProcessingConfigState({
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

  toObject(): StreamProcessingConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
