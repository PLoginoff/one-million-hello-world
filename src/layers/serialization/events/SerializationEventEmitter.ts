/**
 * Serialization Event Emitter
 * 
 * Event emitter for serialization-related events.
 */

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;
export type AsyncEventHandler<T = unknown> = (data: T) => Promise<void>;

export interface EventSubscription {
  id: string;
  event: string;
  handler: EventHandler;
  once: boolean;
}

export class SerializationEventEmitter {
  private _listeners: Map<string, Array<{ id: string; handler: EventHandler; once: boolean }>>;
  private _maxListeners: number;
  private _enabled: boolean;

  constructor(maxListeners: number = 100) {
    this._listeners = new Map();
    this._maxListeners = maxListeners;
    this._enabled = true;
  }

  /**
   * Subscribes to an event
   * 
   * @param event - Event name
   * @param handler - Event handler
   * @returns Subscription ID
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): string {
    if (!this._enabled) {
      throw new Error('Event emitter is disabled');
    }

    const id = this._generateId();
    const listeners = this._listeners.get(event) ?? [];

    if (listeners.length >= this._maxListeners) {
      console.warn(`Max listeners (${this._maxListeners}) reached for event: ${event}`);
    }

    listeners.push({ id, handler: handler as EventHandler, once: false });
    this._listeners.set(event, listeners);

    return id;
  }

  /**
   * Subscribes to an event (only once)
   * 
   * @param event - Event name
   * @param handler - Event handler
   * @returns Subscription ID
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): string {
    if (!this._enabled) {
      throw new Error('Event emitter is disabled');
    }

    const id = this._generateId();
    const listeners = this._listeners.get(event) ?? [];

    listeners.push({ id, handler: handler as EventHandler, once: true });
    this._listeners.set(event, listeners);

    return id;
  }

  /**
   * Unsubscribes from an event
   * 
   * @param event - Event name
   * @param id - Subscription ID
   * @returns True if unsubscribed
   */
  off(event: string, id: string): boolean {
    const listeners = this._listeners.get(event);
    if (!listeners) {
      return false;
    }

    const index = listeners.findIndex(l => l.id === id);
    if (index > -1) {
      listeners.splice(index, 1);
      if (listeners.length === 0) {
        this._listeners.delete(event);
      }
      return true;
    }

    return false;
  }

  /**
   * Removes all listeners for an event
   * 
   * @param event - Event name
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /**
   * Emits an event
   * 
   * @param event - Event name
   * @param data - Event data
   * @returns True if event had listeners
   */
  emit<T = unknown>(event: string, data?: T): boolean {
    if (!this._enabled) {
      return false;
    }

    const listeners = this._listeners.get(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }

    const toRemove: string[] = [];

    for (const listener of listeners) {
      try {
        listener.handler(data);
        if (listener.once) {
          toRemove.push(listener.id);
        }
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }

    for (const id of toRemove) {
      this.off(event, id);
    }

    return true;
  }

  /**
   * Emits an event asynchronously
   * 
   * @param event - Event name
   * @param data - Event data
   * @returns Promise resolving to true if event had listeners
   */
  async emitAsync<T = unknown>(event: string, data?: T): Promise<boolean> {
    if (!this._enabled) {
      return false;
    }

    const listeners = this._listeners.get(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }

    const toRemove: string[] = [];

    for (const listener of listeners) {
      try {
        const result = listener.handler(data);
        if (result instanceof Promise) {
          await result;
        }
        if (listener.once) {
          toRemove.push(listener.id);
        }
      } catch (error) {
        console.error(`Error in async event handler for ${event}:`, error);
      }
    }

    for (const id of toRemove) {
      this.off(event, id);
    }

    return true;
  }

  /**
   * Gets the number of listeners for an event
   * 
   * @param event - Event name
   * @returns Number of listeners
   */
  listenerCount(event: string): number {
    return this._listeners.get(event)?.length ?? 0;
  }

  /**
   * Gets all event names with listeners
   * 
   * @returns Array of event names
   */
  eventNames(): string[] {
    return Array.from(this._listeners.keys());
  }

  /**
   * Gets the maximum number of listeners
   * 
   * @returns Max listeners
   */
  getMaxListeners(): number {
    return this._maxListeners;
  }

  /**
   * Sets the maximum number of listeners
   * 
   * @param max - Maximum listeners
   */
  setMaxListeners(max: number): void {
    this._maxListeners = max;
  }

  /**
   * Enables or disables the event emitter
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if the event emitter is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets all subscriptions
   * 
   * @returns Array of subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    const subscriptions: EventSubscription[] = [];

    for (const [event, listeners] of this._listeners.entries()) {
      for (const listener of listeners) {
        subscriptions.push({
          id: listener.id,
          event,
          handler: listener.handler,
          once: listener.once,
        });
      }
    }

    return subscriptions;
  }

  /**
   * Generates a unique subscription ID
   * 
   * @returns Unique ID
   */
  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
