/**
 * AnomalyDetectionConfigState Entity
 */

export interface AnomalyDetectionConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnomalyDetectionConfigState {
  readonly data: AnomalyDetectionConfigStateData;

  private constructor(data: AnomalyDetectionConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): AnomalyDetectionConfigState {
    const now = Date.now();
    return new AnomalyDetectionConfigState({
      id: 'anomaly-detection-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): AnomalyDetectionConfigState {
    return new AnomalyDetectionConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): AnomalyDetectionConfigState {
    return new AnomalyDetectionConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): AnomalyDetectionConfigState {
    return new AnomalyDetectionConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): AnomalyDetectionConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new AnomalyDetectionConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): AnomalyDetectionConfigState {
    return new AnomalyDetectionConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnomalyDetectionConfigState {
    return new AnomalyDetectionConfigState({
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

  toObject(): AnomalyDetectionConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
