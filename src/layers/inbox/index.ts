/**
 * Inbox Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Inbox Layer (Layer 57 of the architecture).
 */

export { IInbox } from './interfaces/IInbox';
export { Inbox } from './implementations/Inbox';
export * from './types/inbox-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
export * from './adapters';
export * from './health';
export * from './metrics';
export * from './statistics';
export * from './errors';
