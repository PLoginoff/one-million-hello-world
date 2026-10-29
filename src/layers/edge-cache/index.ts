/**
 * EdgeCache Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the EdgeCache Layer (Layer 34 of the architecture).
 */

export { IEdgeCache } from './interfaces/IEdgeCache';
export { EdgeCache } from './implementations/EdgeCache';
export * from './types/edge-cache-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
export * from './cdn';
