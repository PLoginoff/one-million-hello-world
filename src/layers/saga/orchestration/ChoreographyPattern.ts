/**
 * Choreography Pattern
 *
 * Decentralized saga choreography pattern.
 * Services communicate via events to coordinate saga execution.
 */

import { SagaExecutionEntity } from '../domain/entities/SagaExecution';

export class ChoreographyPattern {
  private readonly _eventBus: SagaEventBus;

  constructor() {
    this._eventBus = new SagaEventBus();
  }

  /**
   * Execute saga with choreography pattern
   */
  async execute(sagaId: string, steps: any[]): Promise<SagaExecutionEntity> {
    const executionId = `exec_${Date.now()}`;
    const execution = new SagaExecutionEntity(
      executionId,
      sagaId,
      'pending',
      steps,
      [],
    );

    this._eventBus.publish('saga-started', { executionId, sagaId });

    return execution;
  }

  /**
   * Handle step completion event
   */
  async handleStepCompleted(stepId: string, result: unknown): Promise<void> {
    this._eventBus.publish('step-completed', { stepId, result });
  }

  /**
   * Subscribe to events
   */
  subscribe(eventType: string, handler: (data: unknown) => void): void {
    this._eventBus.subscribe(eventType, handler);
  }
}

class SagaEventBus {
  private readonly _subscribers: Map<string, Set<(data: unknown) => void>>;

  constructor() {
    this._subscribers = new Map();
  }

  publish(eventType: string, data: unknown): void {
    const subscribers = this._subscribers.get(eventType) || new Set();
    for (const handler of subscribers) {
      handler(data);
    }
  }

  subscribe(eventType: string, handler: (data: unknown) => void): void {
    if (!this._subscribers.has(eventType)) {
      this._subscribers.set(eventType, new Set());
    }
    this._subscribers.get(eventType)!.add(handler);
  }
}
