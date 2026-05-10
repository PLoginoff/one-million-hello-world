/**
 * Saga Event
 *
 * Represents a domain event in the saga event sourcing system.
 * Immutable event that records state changes in the saga.
 */

export interface SagaEventData {
  eventId: string;
  eventType: SagaEventType;
  executionId: string;
  timestamp: number;
  version: number;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export type SagaEventType =
  | 'saga-created'
  | 'saga-started'
  | 'saga-completed'
  | 'saga-failed'
  | 'saga-compensating'
  | 'saga-compensated'
  | 'step-created'
  | 'step-started'
  | 'step-completed'
  | 'step-failed'
  | 'step-retried'
  | 'step-skipped'
  | 'compensation-started'
  | 'compensation-completed'
  | 'compensation-failed'
  | 'metadata-updated'
  | 'retry-attempted';

export class SagaEvent {
  readonly data: SagaEventData;

  constructor(data: SagaEventData) {
    this._validateEvent(data);
    this.data = { ...data };
  }

  /**
   * Get event ID
   */
  getEventId(): string {
    return this.data.eventId;
  }

  /**
   * Get event type
   */
  getEventType(): SagaEventType {
    return this.data.eventType;
  }

  /**
   * Get execution ID
   */
  getExecutionId(): string {
    return this.data.executionId;
  }

  /**
   * Get timestamp
   */
  getTimestamp(): number {
    return this.data.timestamp;
  }

  /**
   * Get version
   */
  getVersion(): number {
    return this.data.version;
  }

  /**
   * Get event data
   */
  getData(): unknown {
    return this.data.data;
  }

  /**
   * Get metadata
   */
  getMetadata(): Record<string, unknown> | undefined {
    return this.data.metadata;
  }

  /**
   * Check if is saga event
   */
  isSagaEvent(): boolean {
    return this.data.eventType.startsWith('saga-');
  }

  /**
   * Check if is step event
   */
  isStepEvent(): boolean {
    return this.data.eventType.startsWith('step-');
  }

  /**
   * Check if is compensation event
   */
  isCompensationEvent(): boolean {
    return this.data.eventType.startsWith('compensation-');
  }

  /**
   * Create a copy
   */
  clone(): SagaEvent {
    return new SagaEvent({ ...this.data });
  }

  /**
   * Create saga created event
   */
  static createSagaCreated(executionId: string, data: unknown): SagaEvent {
    return new SagaEvent({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType: 'saga-created',
      executionId,
      timestamp: Date.now(),
      version: 1,
      data,
    });
  }

  /**
   * Create saga started event
   */
  static createSagaStarted(executionId: string, data: unknown): SagaEvent {
    return new SagaEvent({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType: 'saga-started',
      executionId,
      timestamp: Date.now(),
      version: 1,
      data,
    });
  }

  /**
   * Create step started event
   */
  static createStepStarted(executionId: string, stepId: string, data: unknown): SagaEvent {
    const eventData = typeof data === 'object' && data !== null ? data : {};
    return new SagaEvent({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType: 'step-started',
      executionId,
      timestamp: Date.now(),
      version: 1,
      data: { ...eventData, stepId },
    });
  }

  private _validateEvent(data: SagaEventData): void {
    if (!data.eventId || data.eventId.trim().length === 0) {
      throw new Error('Event ID is required');
    }

    if (!data.eventType || data.eventType.trim().length === 0) {
      throw new Error('Event type is required');
    }

    if (!data.executionId || data.executionId.trim().length === 0) {
      throw new Error('Execution ID is required');
    }

    if (data.version < 1) {
      throw new Error('Version must be at least 1');
    }
  }
}
