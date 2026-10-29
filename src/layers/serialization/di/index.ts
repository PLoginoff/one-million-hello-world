/**
 * Dependency Injection Module
 *
 * Exports DI container and related utilities.
 */

export type { IDIContainer } from './IDIContainer';
export { DIContainer } from './DIContainer';
export { ServiceLifetime } from './ServiceLifetime';
export type { ServiceDescriptor } from './ServiceDescriptor';
export { createServiceDescriptor } from './ServiceDescriptor';
