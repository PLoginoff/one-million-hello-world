/**
 * Saga Execution Repository
 *
 * Infrastructure repository for persisting saga executions.
 * Provides data access operations for saga execution storage.
 */

import { SagaExecutionEntity } from '../../domain/entities/SagaExecution';

export interface SagaExecutionRepository {
  save(execution: SagaExecutionEntity): Promise<void>;
  findById(executionId: string): Promise<SagaExecutionEntity | null>;
  findBySagaId(sagaId: string): Promise<SagaExecutionEntity[]>;
  findByStatus(status: string): Promise<SagaExecutionEntity[]>;
  delete(executionId: string): Promise<void>;
  deleteBySagaId(sagaId: string): Promise<void>;
  findAll(limit?: number, offset?: number): Promise<SagaExecutionEntity[]>;
  count(): Promise<number>;
  countByStatus(status: string): Promise<number>;
}

export class InMemorySagaExecutionRepository implements SagaExecutionRepository {
  private readonly _storage: Map<string, SagaExecutionEntity>;

  constructor() {
    this._storage = new Map();
  }

  async save(execution: SagaExecutionEntity): Promise<void> {
    this._storage.set(execution.executionId, execution);
  }

  async findById(executionId: string): Promise<SagaExecutionEntity | null> {
    return this._storage.get(executionId) || null;
  }

  async findBySagaId(sagaId: string): Promise<SagaExecutionEntity[]> {
    const executions: SagaExecutionEntity[] = [];
    for (const execution of this._storage.values()) {
      if (execution.sagaId === sagaId) {
        executions.push(execution);
      }
    }
    return executions;
  }

  async findByStatus(status: string): Promise<SagaExecutionEntity[]> {
    const executions: SagaExecutionEntity[] = [];
    for (const execution of this._storage.values()) {
      if (execution.status === status) {
        executions.push(execution);
      }
    }
    return executions;
  }

  async delete(executionId: string): Promise<void> {
    this._storage.delete(executionId);
  }

  async deleteBySagaId(sagaId: string): Promise<void> {
    const toDelete: string[] = [];
    for (const [id, execution] of this._storage.entries()) {
      if (execution.sagaId === sagaId) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this._storage.delete(id);
    }
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<SagaExecutionEntity[]> {
    const executions = Array.from(this._storage.values());
    return executions.slice(offset, offset + limit);
  }

  async count(): Promise<number> {
    return this._storage.size;
  }

  async countByStatus(status: string): Promise<number> {
    let count = 0;
    for (const execution of this._storage.values()) {
      if (execution.status === status) {
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this._storage.clear();
  }
}
