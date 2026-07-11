/**
 * EventSourcing Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the EventSourcing Layer (Layer 51 of the architecture).
 */

export { IEventSourcing } from './interfaces/IEventSourcing';
export { EventSourcing } from './implementations/EventSourcing';
export * from './types/event-sourcing-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
