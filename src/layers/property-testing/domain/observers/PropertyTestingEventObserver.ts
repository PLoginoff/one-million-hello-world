/**
 * PropertyTestingEventObserver
 */

export interface IPropertyTestingEventListener {
  onEvent(eventType: string, payload: unknown): void;
}

export interface PropertyTestingSubscription {
  id: string;
  eventType: string;
  listener: IPropertyTestingEventListener;
  once: boolean;
}

export class PropertyTestingEventObserver {
  private _subscriptions: Map<string, PropertyTestingSubscription>;
  private _eventLog: Array<{ type: string; payload: unknown; timestamp: number }>;
  private _maxLogSize: number;

  constructor(maxLogSize: number = 1000) {
    this._subscriptions = new Map();
    this._eventLog = [];
    this._maxLogSize = maxLogSize;
  }

  subscribe(eventType: string, listener: IPropertyTestingEventListener): string {
    const id = 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this._subscriptions.set(id, { id, eventType, listener, once: false });
    return id;
  }

  subscribeOnce(eventType: string, listener: IPropertyTestingEventListener): string {
    const id = 'sub-once-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this._subscriptions.set(id, { id, eventType, listener, once: true });
    return id;
  }

  unsubscribe(id: string): boolean {
    return this._subscriptions.delete(id);
  }

  emit(eventType: string, payload: unknown): void {
    this._eventLog.push({ type: eventType, payload, timestamp: Date.now() });
    if (this._eventLog.length > this._maxLogSize) {
      this._eventLog.shift();
    }
    for (const [id, sub] of this._subscriptions) {
      if (sub.eventType === eventType || sub.eventType === '*') {
        sub.listener.onEvent(eventType, payload);
        if (sub.once) {
          this._subscriptions.delete(id);
        }
      }
    }
  }

  getSubscriptionCount(): number {
    return this._subscriptions.size;
  }
  getEventLog(): Array<{ type: string; payload: unknown; timestamp: number }> {
    return [...this._eventLog];
  }
  getEventLogByType(type: string): Array<{ type: string; payload: unknown; timestamp: number }> {
    return this._eventLog.filter((e) => e.type === type);
  }

  clearSubscriptions(): void {
    this._subscriptions.clear();
  }
  clearLog(): void {
    this._eventLog = [];
  }
}
