/**
 * Service Lifetime
 * 
 * Defines the lifecycle of a service in the DI container.
 */

export enum ServiceLifetime {
  /**
   * Singleton - single instance for entire container lifetime
   */
  SINGLETON = 'singleton',

  /**
   * Transient - new instance created each time
   */
  TRANSIENT = 'transient',

  /**
   * Scoped - single instance per scope
   */
  SCOPED = 'scoped',
}
