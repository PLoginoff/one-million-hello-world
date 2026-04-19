/**
 * IEventHandlerRegistry - Application Interface
 * 
 * Interface for registering and managing event handlers.
 * Provides handler discovery and lifecycle management.
 */

import { EventHandler } from '../../core/interfaces';

export interface HandlerRegistration {
  id: string;
  eventType: string;
  handler: EventHandler;
  priority: number;
  metadata?: Record<string, unknown>;
}

export interface IEventHandlerRegistry {
  register(eventType: string, handler: EventHandler, priority?: number): HandlerRegistration;
  unregister(registrationId: string): boolean;
  get(eventType: string): HandlerRegistration[];
  getAll(): HandlerRegistration[];
  getByPriority(eventType: string): HandlerRegistration[];
  clear(): void;
  count(): number;
  countByType(eventType: string): number;
}
