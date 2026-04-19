/**
 * DI Container Interface
 * 
 * Defines the contract for dependency injection container.
 */

import { ServiceLifetime } from './ServiceLifetime';

export interface IDIContainer {
  /**
   * Registers a service in the container
   * 
   * @param token - Service token
   * @param factory - Factory function to create the service
   * @param lifetime - Service lifetime
   * @param dependencies - Service dependencies
   */
  register<T>(
    token: unknown,
    factory: () => T,
    lifetime?: ServiceLifetime,
    dependencies?: unknown[]
  ): void;

  /**
   * Resolves a service from the container
   * 
   * @param token - Service token
   * @returns Service instance
   * @throws Error if service not found or cannot be resolved
   */
  resolve<T>(token: unknown): T;

  /**
   * Checks if a service is registered
   * 
   * @param token - Service token
   * @returns True if registered
   */
  isRegistered(token: unknown): boolean;

  /**
   * Removes a service from the container
   * 
   * @param token - Service token
   */
  unregister(token: unknown): void;

  /**
   * Clears all services from the container
   */
  clear(): void;

  /**
   * Creates a child scope
   * 
   * @returns Child container
   */
  createScope(): IDIContainer;

  /**
   * Gets the parent container (if this is a scoped container)
   * 
   * @returns Parent container or undefined
   */
  getParent(): IDIContainer | undefined;
}
