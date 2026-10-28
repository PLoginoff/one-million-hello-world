/**
 * CircuitBreakerEventHandler
 */

export interface CircuitBreakerDomainEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  source: string;
}

type CircuitBreakerEventHandlerFn = (event: CircuitBreakerDomainEvent) => Promise<void>;

export class CircuitBreakerEventHandler {
  private _handlers: Map<string, CircuitBreakerEventHandlerFn[]>;
  private _globalHandlers: CircuitBreakerEventHandlerFn[];
  private _processed: CircuitBreakerDomainEvent[];
  private _failed: Array<{ event: CircuitBreakerDomainEvent; error: string }>;
  private _maxHistory: number;

  constructor(maxHistory: number = 500) {
    this._handlers = new Map();
    this._globalHandlers = [];
    this._processed = [];
    this._failed = [];
    this._maxHistory = maxHistory;
  }

  on(eventType: string, handler: CircuitBreakerEventHandlerFn): void {
    const handlers = this._handlers.get(eventType) ?? [];
    handlers.push(handler);
    this._handlers.set(eventType, handlers);
  }

  onAny(handler: CircuitBreakerEventHandlerFn): void {
    this._globalHandlers.push(handler);
  }

  off(eventType: string, handler: CircuitBreakerEventHandlerFn): boolean {
    const handlers = this._handlers.get(eventType);
    if (!handlers) return false;
    const idx = handlers.indexOf(handler);
    if (idx === -1) return false;
    handlers.splice(idx, 1);
    return true;
  }

  async dispatch(event: CircuitBreakerDomainEvent): Promise<void> {
    for (const gh of this._globalHandlers) {
      try {
        await gh(event);
      } catch (e) {
        this._failed.push({ event, error: (e as Error).message });
      }
    }
    const handlers = this._handlers.get(event.type) ?? [];
    for (const h of handlers) {
      try {
        await h(event);
      } catch (e) {
        this._failed.push({ event, error: (e as Error).message });
      }
    }
    this._processed.push(event);
    if (this._processed.length > this._maxHistory) this._processed.shift();
  }

  getProcessedEvents(): CircuitBreakerDomainEvent[] {
    return [...this._processed];
  }
  getFailedEvents(): Array<{ event: CircuitBreakerDomainEvent; error: string }> {
    return [...this._failed];
  }
  getHandlerCount(eventType?: string): number {
    if (eventType !== undefined) {
      const handlers = this._handlers.get(eventType);
      return handlers ? handlers.length : 0;
    }
    let total = 0;
    for (const handlers of this._handlers.values()) total += handlers.length;
    return total + this._globalHandlers.length;
  }

  clearHistory(): void {
    this._processed = [];
    this._failed = [];
  }
  clearHandlers(): void {
    this._handlers.clear();
    this._globalHandlers = [];
  }
}
