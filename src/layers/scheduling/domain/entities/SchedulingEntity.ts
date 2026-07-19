/**
 * Scheduling Entity
 */

export interface SchedulingEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class SchedulingEntity {
  readonly data: SchedulingEntityData;

  private constructor(data: SchedulingEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): SchedulingEntity {
    const now = Date.now();
    return new SchedulingEntity({
      id: 'scheduling-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): SchedulingEntity {
    return new SchedulingEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): SchedulingEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
