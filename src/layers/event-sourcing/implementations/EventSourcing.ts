/**
 * EventSourcing Implementation
 *
 * Concrete implementation of IEventSourcing.
 * Handles Event sourcing and event store.
 */

import { IEventSourcing } from '../interfaces/IEventSourcing';
import { EventSourcingResult, EventSourcingContext, EventSourcingError } from '../types/event-sourcing-types';

export class EventSourcing implements IEventSourcing {
  private _config: Record<string, unknown>;
  private _metrics: Map<string, number>;

  constructor() {
    this._config = {};
    this._metrics = new Map();
  }

  async execute(context: EventSourcingContext): Promise<EventSourcingResult<unknown>> {
    const startTime = Date.now();
    try {
      const output = this._process(context);
      this._recordMetric('successCount', 1);
      this._recordMetric('lastExecutionTime', Date.now() - startTime);
      return Promise.resolve({ success: true, data: output });
    } catch (error) {
      this._recordMetric('failureCount', 1);
      const eventSourcingError: EventSourcingError = {
        code: 'EVENTSOURCING_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      return Promise.resolve({
        success: false,
        error: eventSourcingError,
      });
    }
  }

  configure(config: Record<string, unknown>): void {
    this._config = { ...this._config, ...config };
  }

  getStatus(): Record<string, unknown> {
    return {
      config: this._config,
      metrics: Object.fromEntries(this._metrics),
      active: true,
    };
  }

  private _process(context: EventSourcingContext): unknown {
    return { processed: true, context, layer: 'EventSourcing' };
  }

  private _recordMetric(name: string, delta: number): void {
    const current = this._metrics.get(name) ?? 0;
    this._metrics.set(name, current + delta);
  }
}
