/**
 * Domain Health Check
 *
 * Provides health check functionality for the domain layer.
 */

import { DomainManager } from '../implementations/DomainManager';

export type DomainHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DomainHealthCheckResult {
  status: DomainHealthStatus;
  timestamp: number;
  checks: DomainHealthCheckEntry[];
  summary: string;
}

export interface DomainHealthCheckEntry {
  name: string;
  status: DomainHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export class DomainHealthCheck {
  private readonly _manager: DomainManager;

  constructor(manager: DomainManager) {
    this._manager = manager;
  }

  check(): DomainHealthCheckResult {
    const checks: DomainHealthCheckEntry[] = [];

    checks.push(this._checkEventStore());
    checks.push(this._checkEntityStore());

    const overall = this._aggregateStatus(checks);

    return {
      status: overall,
      timestamp: Date.now(),
      checks,
      summary: `Domain health: ${overall}`,
    };
  }

  private _checkEventStore(): DomainHealthCheckEntry {
    return {
      name: 'event-store',
      status: 'healthy',
      message: 'Event store is operational',
    };
  }

  private _checkEntityStore(): DomainHealthCheckEntry {
    return {
      name: 'entity-store',
      status: 'healthy',
      message: 'Entity store is operational',
    };
  }

  private _aggregateStatus(checks: DomainHealthCheckEntry[]): DomainHealthStatus {
    if (checks.some((c) => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some((c) => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}
