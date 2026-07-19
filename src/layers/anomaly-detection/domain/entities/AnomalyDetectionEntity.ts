/**
 * AnomalyDetection Entity
 */

export interface AnomalyDetectionEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class AnomalyDetectionEntity {
  readonly data: AnomalyDetectionEntityData;

  private constructor(data: AnomalyDetectionEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): AnomalyDetectionEntity {
    const now = Date.now();
    return new AnomalyDetectionEntity({
      id: 'anomaly-detection-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): AnomalyDetectionEntity {
    return new AnomalyDetectionEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): AnomalyDetectionEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
