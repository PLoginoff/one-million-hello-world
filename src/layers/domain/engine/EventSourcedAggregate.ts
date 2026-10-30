/**
 * Event-Sourced Rehydration
 *
 * Rebuilds an aggregate's state by replaying its event history through
 * the `when<EventType>` convention handlers. The aggregate starts
 * empty (or from a snapshot), events are applied in `sequenceNumber`
 * order, and the resulting version equals the last applied event's
 * sequence number.
 *
 * @module DomainLayer/Engine
 */

import { EngineDomainEvent, EventHandlerTable, RehydrationResult, StoredEvent } from './types';
import { AggregateRootBase } from './AggregateRoot';

/** Raised when event history is malformed (gap, out-of-order). */
export class EventHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventHistoryError';
  }
}

/**
 * Sort a stored event history by `sequenceNumber` and validate
 * contiguity (no gaps, no duplicates). Gaps mean the event store is
 * corrupt — failing loudly beats silently rehydrating wrong state.
 */
export function validateAndSortHistory(events: readonly StoredEvent[]): StoredEvent[] {
  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].sequenceNumber === sorted[i - 1].sequenceNumber) {
      throw new EventHistoryError(
        `Duplicate sequence number ${sorted[i].sequenceNumber} in event history`
      );
    }
    if (sorted[i].sequenceNumber !== sorted[i - 1].sequenceNumber + 1) {
      throw new EventHistoryError(
        `Gap in event history: ${sorted[i - 1].sequenceNumber} → ${sorted[i].sequenceNumber}`
      );
    }
  }
  return sorted;
}

/**
 * Rehydrate an aggregate from its event history.
 *
 * @param aggregate Empty aggregate to populate (e.g. `new MyAggregate(id)`).
 * @param history   Stored events in any order — validated + sorted.
 * @param handlers  Optional reducer table; when provided it's used
 *                  instead of the `when*` convention.
 */
export function rehydrateFromHistory<T extends AggregateRootBase>(
  aggregate: T,
  history: readonly StoredEvent[],
  handlers?: EventHandlerTable<T>
): RehydrationResult<T> {
  const sorted = validateAndSortHistory(history);
  let applied = 0;

  for (const stored of sorted) {
    const event: EngineDomainEvent = {
      eventId: stored.eventId,
      eventType: stored.eventType,
      aggregateId: stored.aggregateId,
      sequenceNumber: stored.sequenceNumber,
      occurredAt: stored.occurredAt,
      data: stored.data,
    };

    if (handlers !== undefined) {
      const handler = handlers[stored.eventType];
      if (handler !== undefined) {
        handler(aggregate, stored);
      }
      // Manually track version since we bypass apply().
      (aggregate as unknown as { _version: number })._version = stored.sequenceNumber;
    } else {
      aggregate.apply(event, false);
    }
    applied++;
  }

  return { aggregate, version: aggregate.version, eventsApplied: applied };
}

/**
 * Snapshot helper: serialize aggregate state into a portable record.
 * Subclasses can override `toSnapshot()`/`fromSnapshot()` for custom
 * shapes; this is the default `Object.assign`-style snapshot.
 */
export function snapshotState<T extends object>(aggregate: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(aggregate)) {
    if (key.startsWith('_')) {
      continue; // skip private fields
    }
    out[key] = value;
  }
  return out;
}
