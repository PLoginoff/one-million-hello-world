/**
 * Event Reconstructor
 *
 * Reconstructs saga state from events.
 * Provides event sourcing projection capabilities.
 */

import { SagaEvent } from './SagaEvent';
import { SagaExecutionEntity } from '../entities/SagaExecution';
import { SagaMetadata } from '../value-objects/SagaMetadata';

export class EventReconstructor {
  /**
   * Reconstruct saga execution from events
   */
  reconstructFromEvents(events: SagaEvent[]): SagaExecutionEntity | null {
    if (events.length === 0) {
      return null;
    }

    const sortedEvents = [...events].sort((a, b) => a.getTimestamp() - b.getTimestamp());
    const firstEvent = sortedEvents[0];

    let executionId = firstEvent.getExecutionId();
    let sagaId = 'unknown';
    let status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated' = 'pending';
    let metadata = new SagaMetadata({
      startTime: firstEvent.getTimestamp(),
      duration: 0,
      attemptCount: 1,
      lastAttemptTime: firstEvent.getTimestamp(),
    });

    for (const event of sortedEvents) {
      switch (event.getEventType()) {
        case 'saga-created':
          const data = event.getData() as any;
          sagaId = data.sagaId || sagaId;
          break;
        case 'saga-started':
          status = 'running';
          break;
        case 'saga-completed':
          status = 'completed';
          metadata = metadata.markAsCompleted();
          break;
        case 'saga-failed':
          status = 'failed';
          const errorData = event.getData() as any;
          metadata = metadata.markAsFailed(errorData.errorMessage || 'Unknown error');
          break;
        case 'saga-compensating':
          status = 'compensating';
          break;
        case 'saga-compensated':
          status = 'compensated';
          break;
        case 'retry-attempted':
          metadata = metadata.incrementAttemptCount();
          break;
      }
    }

    return new SagaExecutionEntity(
      executionId,
      sagaId,
      status,
      [],
      [],
      metadata,
    );
  }

  /**
   * Get state at specific version
   */
  getStateAtVersion(events: SagaEvent[], version: number): SagaExecutionEntity | null {
    const versionedEvents = events.filter(e => e.getVersion() <= version);
    return this.reconstructFromEvents(versionedEvents);
  }

  /**
   * Get state at specific timestamp
   */
  getStateAtTimestamp(events: SagaEvent[], timestamp: number): SagaExecutionEntity | null {
    const timestampedEvents = events.filter(e => e.getTimestamp() <= timestamp);
    return this.reconstructFromEvents(timestampedEvents);
  }

  /**
   * Get event timeline
   */
  getTimeline(events: SagaEvent[]): Array<{ timestamp: number; eventType: string; description: string }> {
    const sortedEvents = [...events].sort((a, b) => a.getTimestamp() - b.getTimestamp());

    return sortedEvents.map(event => ({
      timestamp: event.getTimestamp(),
      eventType: event.getEventType(),
      description: this._getEventDescription(event.getEventType()),
    }));
  }

  private _getEventDescription(eventType: string): string {
    const descriptions: Record<string, string> = {
      'saga-created': 'Saga was created',
      'saga-started': 'Saga execution started',
      'saga-completed': 'Saga execution completed successfully',
      'saga-failed': 'Saga execution failed',
      'saga-compensating': 'Compensation process started',
      'saga-compensated': 'Compensation process completed',
      'step-created': 'Step was created',
      'step-started': 'Step execution started',
      'step-completed': 'Step execution completed',
      'step-failed': 'Step execution failed',
      'step-retried': 'Step execution retried',
      'step-skipped': 'Step execution skipped',
      'compensation-started': 'Compensation for step started',
      'compensation-completed': 'Compensation for step completed',
      'compensation-failed': 'Compensation for step failed',
      'metadata-updated': 'Saga metadata was updated',
      'retry-attempted': 'Retry attempt was made',
    };

    return descriptions[eventType] || 'Unknown event';
  }
}
