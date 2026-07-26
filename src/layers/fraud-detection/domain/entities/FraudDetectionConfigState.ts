/**
 * FraudDetectionConfigState Entity
 */

export interface FraudDetectionConfigStateData {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FraudDetectionConfigState {
  readonly data: FraudDetectionConfigStateData;

  private constructor(data: FraudDetectionConfigStateData) {
    this.data = { ...data, tags: [...data.tags] };
  }

  static create(attributes: Record<string, unknown> = {}, tags: string[] = []): FraudDetectionConfigState {
    const now = Date.now();
    return new FraudDetectionConfigState({
      id: 'fraud-detection-cfg-' + now + '-' + Math.random().toString(36).slice(2, 8),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      attributes: { ...attributes },
      tags: [...tags],
    });
  }

  activate(): FraudDetectionConfigState {
    return new FraudDetectionConfigState({ ...this.data, status: 'active', updatedAt: Date.now() });
  }

  complete(): FraudDetectionConfigState {
    return new FraudDetectionConfigState({ ...this.data, status: 'completed', updatedAt: Date.now() });
  }

  fail(): FraudDetectionConfigState {
    return new FraudDetectionConfigState({ ...this.data, status: 'failed', updatedAt: Date.now() });
  }

  addTag(tag: string): FraudDetectionConfigState {
    if (this.data.tags.includes(tag)) return this;
    return new FraudDetectionConfigState({ ...this.data, tags: [...this.data.tags, tag], updatedAt: Date.now() });
  }

  removeTag(tag: string): FraudDetectionConfigState {
    return new FraudDetectionConfigState({
      ...this.data,
      tags: this.data.tags.filter(function (t) {
        return t !== tag;
      }),
      updatedAt: Date.now(),
    });
  }

  updateAttributes(attrs: Record<string, unknown>): FraudDetectionConfigState {
    return new FraudDetectionConfigState({
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

  toObject(): FraudDetectionConfigStateData {
    return { ...this.data, attributes: { ...this.data.attributes }, tags: [...this.data.tags] };
  }
}
