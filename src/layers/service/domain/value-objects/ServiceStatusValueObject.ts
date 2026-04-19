/**
 * Service Status Value Object
 * 
 * Represents service status.
 */

export enum ServiceStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  STARTING = 'starting',
  STOPPING = 'stopping',
}

export class ServiceStatusValueObject {
  readonly status: ServiceStatus;

  private constructor(status: ServiceStatus) {
    this.status = status;
  }

  /**
   * Create healthy status
   */
  static healthy(): ServiceStatusValueObject {
    return new ServiceStatusValueObject(ServiceStatus.HEALTHY);
  }

  /**
   * Create degraded status
   */
  static degraded(): ServiceStatusValueObject {
    return new ServiceStatusValueObject(ServiceStatus.DEGRADED);
  }

  /**
   * Create unhealthy status
   */
  static unhealthy(): ServiceStatusValueObject {
    return new ServiceStatusValueObject(ServiceStatus.UNHEALTHY);
  }

  /**
   * Create starting status
   */
  static starting(): ServiceStatusValueObject {
    return new ServiceStatusValueObject(ServiceStatus.STARTING);
  }

  /**
   * Create stopping status
   */
  static stopping(): ServiceStatusValueObject {
    return new ServiceStatusValueObject(ServiceStatus.STOPPING);
  }

  /**
   * Check if status is healthy
   */
  isHealthy(): boolean {
    return this.status === ServiceStatus.HEALTHY;
  }

  /**
   * Check if status is degraded
   */
  isDegraded(): boolean {
    return this.status === ServiceStatus.DEGRADED;
  }

  /**
   * Check if status is unhealthy
   */
  isUnhealthy(): boolean {
    return this.status === ServiceStatus.UNHEALTHY;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return [ServiceStatus.HEALTHY, ServiceStatus.DEGRADED].includes(this.status);
  }

  /**
   * Clone the value object
   */
  clone(): ServiceStatusValueObject {
    return new ServiceStatusValueObject(this.status);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.status;
  }

  /**
   * Check if two statuses are equal
   */
  equals(other: ServiceStatusValueObject): boolean {
    return this.status === other.status;
  }
}
