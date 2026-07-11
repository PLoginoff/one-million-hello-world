import { DomainEntity } from '../types/domain-types';

export interface HealthCheckComponent {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
}

export class HealthCheck implements DomainEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly components: HealthCheckComponent[];
  readonly version: string;

  constructor(
    id: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    components: HealthCheckComponent[],
    version: string
  ) {
    this.id = id;
    this.status = status;
    this.components = [...components];
    this.version = version;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  static create(components: HealthCheckComponent[], version: string): HealthCheck {
    const status = HealthCheck._aggregateStatus(components);
    return new HealthCheck(
      `health-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      status,
      components,
      version
    );
  }

  static healthy(version: string): HealthCheck {
    return HealthCheck.create(
      [
        { name: 'application', status: 'healthy', latencyMs: 0 },
        { name: 'layers', status: 'healthy', latencyMs: 0 },
      ],
      version
    );
  }

  isHealthy(): boolean {
    return this.status === 'healthy';
  }

  toPayload(): Record<string, unknown> {
    return {
      id: this.id,
      status: this.status,
      version: this.version,
      components: this.components,
      timestamp: this.createdAt.toISOString(),
    };
  }

  private static _aggregateStatus(components: HealthCheckComponent[]): 'healthy' | 'degraded' | 'unhealthy' {
    if (components.some((c) => c.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (components.some((c) => c.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }
}
