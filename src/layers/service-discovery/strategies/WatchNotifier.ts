/**
 * WatchNotifier
 *
 * Pub/sub on top of IServiceRegistry.watch with filtering, buffering, and
 * replay. Lets subscribers receive only events matching a predicate
 * (e.g. only for `orders-api`), and lets late subscribers replay the recent
 * event log (like Consul's blocking query with X-Consul-Index).
 *
 * @module ServiceDiscoveryLayer/Strategies
 */

import {
  RegistryEvent,
  RegistryEventType,
  IServiceRegistry,
} from '../types/service-instance';

/** Predicate: which events a subscriber cares about. */
export interface EventFilter {
  /** Only these event types. */
  types?: RegistryEventType[];
  /** Only events for this service name. */
  serviceName?: string;
  /** Only events for this instance id. */
  instanceId?: string;
}

export function matchesFilter(event: RegistryEvent, filter: EventFilter): boolean {
  if (filter.types && !filter.types.includes(event.type)) {
    return false;
  }
  if (filter.serviceName !== undefined && event.instance.serviceName !== filter.serviceName) {
    return false;
  }
  if (filter.instanceId !== undefined && event.instance.id !== filter.instanceId) {
    return false;
  }
  return true;
}

export type EventHandler = (event: RegistryEvent) => void;

interface Subscription {
  filter: EventFilter;
  handler: EventHandler;
}

export class WatchNotifier {
  private readonly _registry: IServiceRegistry;
  private readonly _subscriptions: Set<Subscription>;
  private readonly _replayBuffer: RegistryEvent[];
  private readonly _replayCapacity: number;
  private _unsubscribeFromRegistry: (() => void) | null;
  private _deliveries: number;

  constructor(registry: IServiceRegistry, replayCapacity: number = 256) {
    this._registry = registry;
    this._subscriptions = new Set();
    this._replayBuffer = [];
    this._replayCapacity = replayCapacity;
    this._unsubscribeFromRegistry = null;
    this._deliveries = 0;
  }

  /** Start listening to the registry (idempotent). */
  start(): void {
    if (this._unsubscribeFromRegistry) {
      return;
    }
    this._unsubscribeFromRegistry = this._registry.watch((event) => this._dispatch(event));
  }

  /** Stop listening. */
  stop(): void {
    if (this._unsubscribeFromRegistry) {
      this._unsubscribeFromRegistry();
      this._unsubscribeFromRegistry = null;
    }
  }

  /**
   * Subscribe. Returns an unsubscribe function.
   * @param replay if true, deliver buffered matching events immediately
   */
  subscribe(filter: EventFilter, handler: EventHandler, replay: boolean = false): () => void {
    const sub: Subscription = { filter, handler };
    this._subscriptions.add(sub);
    if (replay) {
      for (const ev of this._replayBuffer) {
        if (matchesFilter(ev, filter)) {
          this._safe(handler, ev);
        }
      }
    }
    return () => {
      this._subscriptions.delete(sub);
    };
  }

  /** Delivered event count (across all subscribers). */
  get deliveries(): number {
    return this._deliveries;
  }

  get subscriptionCount(): number {
    return this._subscriptions.size;
  }

  private _dispatch(event: RegistryEvent): void {
    this._replayBuffer.push(event);
    if (this._replayBuffer.length > this._replayCapacity) {
      this._replayBuffer.shift();
    }
    for (const sub of this._subscriptions) {
      if (matchesFilter(event, sub.filter)) {
        this._safe(sub.handler, event);
      }
    }
  }

  private _safe(handler: EventHandler, event: RegistryEvent): void {
    try {
      handler(event);
      this._deliveries += 1;
    } catch {
      // Isolate subscriber failures.
    }
  }
}
