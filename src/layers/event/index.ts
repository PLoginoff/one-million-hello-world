/**
 * Event Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Event Layer (Layer 13 of the 25-layer architecture).
 * 
 * The Event Layer provides event bus, Pub/Sub,
 * and domain event propagation.
 * 
 * @module EventLayer
 */

export { IEventBus } from './interfaces/IEventBus';
export { EventBus } from './implementations/EventBus';
export * from './types/event-types';
