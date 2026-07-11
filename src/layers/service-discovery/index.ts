/**
 * ServiceDiscovery Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the ServiceDiscovery Layer (Layer 28 of the architecture).
 */

export { IServiceDiscovery } from './interfaces/IServiceDiscovery';
export { ServiceDiscovery } from './implementations/ServiceDiscovery';
export * from './types/service-discovery-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
