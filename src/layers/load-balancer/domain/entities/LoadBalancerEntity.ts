/**
 * LoadBalancer Entity
 *
 * Core domain entity for the Load balancing and traffic distribution layer.
 */

export class LoadBalancerEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly data: Record<string, unknown>;

  constructor(id: string, data: Record<string, unknown>) {
    this.id = id;
    this.createdAt = new Date();
    this.data = { ...data };
  }

  static create(data: Record<string, unknown>): LoadBalancerEntity {
    return new LoadBalancerEntity(`load-balancer-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`, data);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      data: this.data,
    };
  }
}
