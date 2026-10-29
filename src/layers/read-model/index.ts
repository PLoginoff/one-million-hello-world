/**
 * ReadModel Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the ReadModel Layer (Layer 53 of the architecture).
 */

export { IReadModel } from './interfaces/IReadModel';
export { ReadModel } from './implementations/ReadModel';
export * from './implementations/ProjectionStore';
export * from './implementations/ProjectionUpdater';
export * from './implementations/QueryEngine';
export * from './implementations/ReadConsistency';
export * from './types/read-model-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
