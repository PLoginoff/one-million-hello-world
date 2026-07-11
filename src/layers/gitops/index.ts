/**
 * Gitops Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Gitops Layer (Layer 50 of the architecture).
 */

export { IGitops } from './interfaces/IGitops';
export { Gitops } from './implementations/Gitops';
export * from './types/gitops-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
