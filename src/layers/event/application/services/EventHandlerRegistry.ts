/**
 * EventHandlerRegistry - Application Service
 * 
 * Registry for managing event handlers with priority support.
 * Provides handler discovery and lifecycle management.
 */

import { IEventHandlerRegistry, HandlerRegistration } from '../interfaces';
import { EventHandler } from '../../core/interfaces';

export class EventHandlerRegistry implements IEventHandlerRegistry {
  private _registrations: Map<string, HandlerRegistration>;
  private _eventTypeIndex: Map<string, Set<string>>;

  constructor() {
    this._registrations = new Map();
    this._eventTypeIndex = new Map();
  }

  register(eventType: string, handler: EventHandler, priority: number = 0): HandlerRegistration {
    const id = this._generateId();
    const registration: HandlerRegistration = {
      id,
      eventType,
      handler,
      priority,
    };

    this._registrations.set(id, registration);

    if (!this._eventTypeIndex.has(eventType)) {
      this._eventTypeIndex.set(eventType, new Set());
    }
    this._eventTypeIndex.get(eventType)!.add(id);

    return registration;
  }

  unregister(registrationId: string): boolean {
    const registration = this._registrations.get(registrationId);
    if (!registration) {
      return false;
    }

    const eventTypeSet = this._eventTypeIndex.get(registration.eventType);
    if (eventTypeSet) {
      eventTypeSet.delete(registrationId);
      if (eventTypeSet.size === 0) {
        this._eventTypeIndex.delete(registration.eventType);
      }
    }

    return this._registrations.delete(registrationId);
  }

  get(eventType: string): HandlerRegistration[] {
    const ids = this._eventTypeIndex.get(eventType);
    if (!ids) {
      return [];
    }

    const registrations: HandlerRegistration[] = [];
    for (const id of ids) {
      const registration = this._registrations.get(id);
      if (registration) {
        registrations.push({ ...registration });
      }
    }

    return registrations;
  }

  getAll(): HandlerRegistration[] {
    return Array.from(this._registrations.values()).map(reg => ({ ...reg }));
  }

  getByPriority(eventType: string): HandlerRegistration[] {
    const registrations = this.get(eventType);
    return registrations.sort((a, b) => b.priority - a.priority);
  }

  clear(): void {
    this._registrations.clear();
    this._eventTypeIndex.clear();
  }

  count(): number {
    return this._registrations.size;
  }

  countByType(eventType: string): number {
    const ids = this._eventTypeIndex.get(eventType);
    return ids ? ids.size : 0;
  }

  private _generateId(): string {
    return `reg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }
}
