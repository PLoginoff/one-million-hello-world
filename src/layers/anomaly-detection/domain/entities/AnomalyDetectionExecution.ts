/**
 * AnomalyDetectionExecution Entity
 *
 * Tracks a single anomaly-detection execution.
 */

export interface AnomalyDetectionExecutionData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnomalyDetectionExecution {
  readonly data: AnomalyDetectionExecutionData;

  private constructor(data: AnomalyDetectionExecutionData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AnomalyDetectionExecution {
    const now = Date.now();
    return new AnomalyDetectionExecution({
      id: 'anomaly-detection-exec-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AnomalyDetectionExecution {
    return new AnomalyDetectionExecution({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AnomalyDetectionExecution {
    return new AnomalyDetectionExecution({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AnomalyDetectionExecution {
    return new AnomalyDetectionExecution({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AnomalyDetectionExecution {
    if (this.data.tags.includes(tag)) return this;
    return new AnomalyDetectionExecution({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AnomalyDetectionExecution {
    return new AnomalyDetectionExecution({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnomalyDetectionExecution {
    return new AnomalyDetectionExecution({
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

  toObject(): AnomalyDetectionExecutionData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
