/**
 * Event Engine — public surface.
 *
 * Second storage/dispatch engine for the event layer: append-only commit
 * log with per-stream ordering and optimistic concurrency, position-based
 * catch-up subscriptions, checkpointed projections, and schema upcasting.
 *
 * @module EventLayer/Engine
 */

export { EventLog } from './EventLog';
export type { EventLogOptions } from './EventLog';
export { UpcasterRegistry } from './Upcasting';
export { ProjectionEngine } from './ProjectionEngine';
export type { ProjectionDef, ProjectionCheckpoint, ProjectionHandler } from './ProjectionEngine';
export { CatchUpSubscription } from './CatchUpSubscription';
export type { PollResult } from './CatchUpSubscription';
// Renamed to avoid colliding with core/ISubscriptionManager's `Subscription`.
export type { Subscription as EngineSubscription } from './CatchUpSubscription';
export { EventEngine } from './EventEngine';
export {
  EventConcurrencyError,
  EventEngineError,
} from './types';
export type {
  EventEnvelopeMeta,
  EngineEvent,
  StoredEngineEvent,
  Upcaster,
} from './types';
