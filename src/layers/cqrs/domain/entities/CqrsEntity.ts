/**
 * Cqrs Entity
 *
 * Core domain entity for the Command Query Responsibility Segregation layer.
 */

export class CqrsEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly data: Record<string, unknown>;

  constructor(id: string, data: Record<string, unknown>) {
    this.id = id;
    this.createdAt = new Date();
    this.data = { ...data };
  }

  static create(data: Record<string, unknown>): CqrsEntity {
    return new CqrsEntity(
      `cqrs-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      data
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      data: this.data,
    };
  }
}
