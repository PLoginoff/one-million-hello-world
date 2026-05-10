/**
 * Service Composition Value Object
 *
 * Represents service composition for facades.
 * Immutable value object for managing service compositions.
 */

export interface ServiceCompositionData {
  services: ServiceDefinition[];
  executionOrder: ExecutionOrder;
  parallelismEnabled: boolean;
  maxConcurrentServices: number;
  timeoutStrategy: TimeoutStrategy;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  type: 'internal' | 'external' | 'hybrid';
  required: boolean;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
}

export type ExecutionOrder = 'sequential' | 'parallel' | 'mixed';
export type TimeoutStrategy = 'fail-fast' | 'continue-on-error' | 'best-effort';

export class ServiceComposition {
  readonly data: ServiceCompositionData;

  constructor(data: ServiceCompositionData) {
    this._validateComposition(data);
    this.data = { ...data, services: [...data.services] };
  }

  /**
   * Get services
   */
  getServices(): ServiceDefinition[] {
    return [...this.data.services];
  }

  /**
   * Get service by ID
   */
  getServiceById(id: string): ServiceDefinition | undefined {
    return this.data.services.find((s) => s.id === id);
  }

  /**
   * Get required services
   */
  getRequiredServices(): ServiceDefinition[] {
    return this.data.services.filter((s) => s.required);
  }

  /**
   * Get optional services
   */
  getOptionalServices(): ServiceDefinition[] {
    return this.data.services.filter((s) => !s.required);
  }

  /**
   * Get execution order
   */
  getExecutionOrder(): ExecutionOrder {
    return this.data.executionOrder;
  }

  /**
   * Check if parallelism is enabled
   */
  isParallelismEnabled(): boolean {
    return this.data.parallelismEnabled;
  }

  /**
   * Get max concurrent services
   */
  getMaxConcurrentServices(): number {
    return this.data.maxConcurrentServices;
  }

  /**
   * Get timeout strategy
   */
  getTimeoutStrategy(): TimeoutStrategy {
    return this.data.timeoutStrategy;
  }

  /**
   * Check if service exists
   */
  hasService(id: string): boolean {
    return this.data.services.some((s) => s.id === id);
  }

  /**
   * Add service
   */
  addService(service: ServiceDefinition): ServiceComposition {
    return new ServiceComposition({
      ...this.data,
      services: [...this.data.services, service],
    });
  }

  /**
   * Remove service
   */
  removeService(id: string): ServiceComposition {
    return new ServiceComposition({
      ...this.data,
      services: this.data.services.filter((s) => s.id !== id),
    });
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<ServiceCompositionData>): ServiceComposition {
    return new ServiceComposition({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): ServiceComposition {
    return new ServiceComposition({ ...this.data, services: [...this.data.services] });
  }

  /**
   * Create sequential composition
   */
  static createSequential(services: ServiceDefinition[]): ServiceComposition {
    return new ServiceComposition({
      services,
      executionOrder: 'sequential',
      parallelismEnabled: false,
      maxConcurrentServices: 1,
      timeoutStrategy: 'fail-fast',
    });
  }

  /**
   * Create parallel composition
   */
  static createParallel(services: ServiceDefinition[], maxConcurrent?: number): ServiceComposition {
    return new ServiceComposition({
      services,
      executionOrder: 'parallel',
      parallelismEnabled: true,
      maxConcurrentServices: maxConcurrent || services.length,
      timeoutStrategy: 'fail-fast',
    });
  }

  private _validateComposition(data: ServiceCompositionData): void {
    if (data.services.length === 0) {
      throw new Error('At least one service is required');
    }

    if (data.maxConcurrentServices < 1) {
      throw new Error('Max concurrent services must be at least 1');
    }

    if (data.parallelismEnabled && data.maxConcurrentServices > data.services.length) {
      throw new Error('Max concurrent services cannot exceed total services');
    }

    const serviceIds = data.services.map((s) => s.id);
    const uniqueIds = new Set(serviceIds);
    if (uniqueIds.size !== serviceIds.length) {
      throw new Error('Service IDs must be unique');
    }

    for (const service of data.services) {
      if (!service.id || service.id.trim().length === 0) {
        throw new Error('Service ID is required');
      }

      if (!service.name || service.name.trim().length === 0) {
        throw new Error('Service name is required');
      }

      if (service.timeout <= 0) {
        throw new Error('Service timeout must be positive');
      }

      if (service.retryPolicy.maxAttempts < 1) {
        throw new Error('Service max attempts must be at least 1');
      }
    }
  }
}
