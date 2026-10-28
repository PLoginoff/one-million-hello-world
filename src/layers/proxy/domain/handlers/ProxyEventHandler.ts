/**
 * ProxyEventHandler
 */

export interface ProxyDomainEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  source: string;
}

type ProxyEventHandlerFn = (event: ProxyDomainEvent) => Promise<void>;

export class ProxyEventHandler {
  private _handlers: Map<string, ProxyEventHandlerFn[]>;
  private _globalHandlers: ProxyEventHandlerFn[];
  private _processed: ProxyDomainEvent[];
  private _failed: Array<{ event: ProxyDomainEvent; error: string }>;
  private _maxHistory: number;

  constructor(maxHistory: number = 500) {
    this._handlers = new Map();
    this._globalHandlers = [];
    this._processed = [];
    this._failed = [];
    this._maxHistory = maxHistory;
  }

  on(eventType: string, handler: ProxyEventHandlerFn): void {
    const handlers = this._handlers.get(eventType) ?? [];
    handlers.push(handler);
    this._handlers.set(eventType, handlers);
  }

  onAny(handler: ProxyEventHandlerFn): void {
    this._globalHandlers.push(handler);
  }

  off(eventType: string, handler: ProxyEventHandlerFn): boolean {
    const handlers = this._handlers.get(eventType);
    if (!handlers) return false;
    const idx = handlers.indexOf(handler);
    if (idx === -1) return false;
    handlers.splice(idx, 1);
    return true;
  }

  async dispatch(event: ProxyDomainEvent): Promise<void> {
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

  getProcessedEvents(): ProxyDomainEvent[] {
    return [...this._processed];
  }
  getFailedEvents(): Array<{ event: ProxyDomainEvent; error: string }> {
    return [...this._failed];
  }
  getHandlerCount(eventType?: string): number {
    if (eventType !== undefined && eventType !== '') return this._handlers.get(eventType)?.length ?? 0;
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
