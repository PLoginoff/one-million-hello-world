/**
 * Service Descriptor
 * 
 * Describes how a service should be created in the DI container.
 */

import { ServiceLifetime } from './ServiceLifetime';

export interface ServiceDescriptor<T = unknown> {
  /**
   * Service token (class constructor or symbol)
   */
  token: unknown;

  /**
   * Factory function to create the service instance
   */
  factory: () => T;

  /**
   * Service lifetime
   */
  lifetime: ServiceLifetime;

  /**
   * Optional dependencies (tokens of services this service depends on)
   */
  dependencies?: unknown[];
}

export function createServiceDescriptor<T>(
  token: unknown,
  factory: () => T,
  lifetime: ServiceLifetime = ServiceLifetime.TRANSIENT,
  dependencies?: unknown[]
): ServiceDescriptor<T> {
  return {
    token,
    factory,
    lifetime,
    dependencies,
  };
}
