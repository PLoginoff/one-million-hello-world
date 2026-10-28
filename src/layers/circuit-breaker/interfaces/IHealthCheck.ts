/**
 * Circuit Breaker Health Check Interface
 *
 * Defines the contract for health check implementations.
 *
 * @module CircuitBreakerLayer/Interfaces
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckEntry {
  name: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: number;
  checks: HealthCheckEntry[];
  summary: string;
}

export interface IHealthCheck {
  /**
   * Perform health check
   * @returns Health check result
   */
  check(): HealthCheckResult;

  /**
   * Get health check name
   * @returns Health check name
   */
  getName(): string;

  /**
   * Check if health check is enabled
   * @returns True if enabled
   */
  isEnabled(): boolean;
}
