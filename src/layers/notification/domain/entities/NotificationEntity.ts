/**
 * Notification Entity
 */

export interface NotificationEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class NotificationEntity {
  readonly data: NotificationEntityData;

  private constructor(data: NotificationEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): NotificationEntity {
    const now = Date.now();
    return new NotificationEntity({
      id: 'notification-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): NotificationEntity {
    return new NotificationEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): NotificationEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
