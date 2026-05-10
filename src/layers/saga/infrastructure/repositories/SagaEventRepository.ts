/**
 * Saga Event Repository
 *
 * Infrastructure repository for persisting saga events.
 * Provides data access operations for saga event sourcing.
 */

export interface SagaEvent {
  eventId: string;
  executionId: string;
  eventType: 'saga-started' | 'saga-completed' | 'saga-failed' | 'saga-compensating' | 'saga-compensated' | 'step-started' | 'step-completed' | 'step-failed' | 'compensation-started' | 'compensation-completed' | 'compensation-failed';
  timestamp: number;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface SagaEventRepository {
  save(event: SagaEvent): Promise<void>;
  findByExecutionId(executionId: string): Promise<SagaEvent[]>;
  findByEventType(eventType: string): Promise<SagaEvent[]>;
  findByTimeRange(startTime: number, endTime: number): Promise<SagaEvent[]>;
  deleteByExecutionId(executionId: string): Promise<void>;
  deleteOlderThan(timestamp: number): Promise<void>;
  count(): Promise<number>;
}

export class InMemorySagaEventRepository implements SagaEventRepository {
  private readonly _storage: SagaEvent[];

  constructor() {
    this._storage = [];
  }

  async save(event: SagaEvent): Promise<void> {
    this._storage.push(event);
  }

  async findByExecutionId(executionId: string): Promise<SagaEvent[]> {
    return this._storage.filter(e => e.executionId === executionId);
  }

  async findByEventType(eventType: string): Promise<SagaEvent[]> {
    return this._storage.filter(e => e.eventType === eventType);
  }

  async findByTimeRange(startTime: number, endTime: number): Promise<SagaEvent[]> {
    return this._storage.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  async deleteByExecutionId(executionId: string): Promise<void> {
    const indices: number[] = [];
    for (let i = 0; i < this._storage.length; i++) {
      if (this._storage[i].executionId === executionId) {
        indices.push(i);
      }
    }
    for (let i = indices.length - 1; i >= 0; i--) {
      this._storage.splice(indices[i], 1);
    }
  }

  async deleteOlderThan(timestamp: number): Promise<void> {
    for (let i = this._storage.length - 1; i >= 0; i--) {
      if (this._storage[i].timestamp < timestamp) {
        this._storage.splice(i, 1);
      }
    }
  }

  async count(): Promise<number> {
    return this._storage.length;
  }

  clear(): void {
    this._storage.length = 0;
  }
}
