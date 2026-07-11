/**
 * ServiceMesh Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the ServiceMesh Layer (Layer 47 of the architecture).
 */

export { IServiceMesh } from './interfaces/IServiceMesh';
export { ServiceMesh } from './implementations/ServiceMesh';
export * from './types/service-mesh-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
