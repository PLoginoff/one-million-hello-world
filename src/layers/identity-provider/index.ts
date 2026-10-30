/**
 * IdentityProvider Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the IdentityProvider Layer (Layer 66 of the architecture).
 */

export { IIdentityProvider } from './interfaces/IIdentityProvider';
export { IdentityProvider } from './implementations/IdentityProvider';
export * from './types/identity-provider-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
export * from './federation';

// Engine2 (deeper capabilities)
export * from "./engine2";
