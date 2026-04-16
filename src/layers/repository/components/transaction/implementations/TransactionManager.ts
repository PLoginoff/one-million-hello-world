/**
 * Transaction Manager Implementation
 * 
 * Concrete implementation of ITransactionManager.
 * Handles transaction management with isolation levels and rollback support.
 */

import { ITransactionManager } from '../interfaces/ITransactionManager';
import {
  TransactionResult,
  TransactionConfig,
  TransactionContext,
  TransactionState,
  IsolationLevel,
  TransactionStats,
  TransactionOperation,
  TransactionOperationType,
  TransactionSnapshot,
  TransactionError,
} from '../types/transaction-types';

export class TransactionManager implements ITransactionManager {
  private _transactions: Map<string, TransactionContext>;
  private _config: TransactionConfig;
  private _stats: TransactionStats;
  private _transactionIdCounter: number;

  constructor(config?: Partial<TransactionConfig>) {
    this._transactions = new Map();
    this._config = {
      isolationLevel: IsolationLevel.READ_COMMITTED,
      timeout: 30000,
      readOnly: false,
      autoCommit: false,
      ...config,
    };
    this._stats = {
      totalTransactions: 0,
      activeTransactions: 0,
      committedTransactions: 0,
      rolledBackTransactions: 0,
      failedTransactions: 0,
      averageDuration: 0,
    };
    this._transactionIdCounter = 0;
  }

  async begin(config?: Partial<TransactionConfig>): Promise<TransactionResult<TransactionContext>> {
    const transactionId = this._generateTransactionId();
    const startTime = Date.now();

    const transactionConfig = { ...this._config, ...config };

    const snapshot: TransactionSnapshot = {
      data: new Map(),
      metadata: new Map(),
    };

    const context: TransactionContext = {
      transactionId,
      state: TransactionState.ACTIVE,
      startTime: new Date(),
      operations: [],
      snapshot,
    };

    this._transactions.set(transactionId, context);
    this._stats.totalTransactions++;
    this._stats.activeTransactions++;

    return {
      success: true,
      data: context,
      transactionId,
      state: TransactionState.ACTIVE,
    };
  }

  async commit(transactionId: string): Promise<TransactionResult<void>> {
    const context = this._transactions.get(transactionId);

    if (!context) {
      return {
        success: false,
        transactionId,
        state: TransactionState.FAILED,
        error: this._createError(
          transactionId,
          TransactionState.FAILED,
          'TRANSACTION_NOT_FOUND',
          `Transaction ${transactionId} not found`
        ),
      };
    }

    if (context.state !== TransactionState.ACTIVE) {
      return {
        success: false,
        transactionId,
        state: context.state,
        error: this._createError(
          transactionId,
          context.state,
          'INVALID_STATE',
          `Transaction is not in ACTIVE state`
        ),
      };
    }

    context.state = TransactionState.COMMITTED;
    this._stats.activeTransactions--;
    this._stats.committedTransactions++;

    const duration = Date.now() - context.startTime.getTime();
    this._updateAverageDuration(duration);

    return {
      success: true,
      transactionId,
      state: TransactionState.COMMITTED,
    };
  }

  async rollback(transactionId: string): Promise<TransactionResult<void>> {
    const context = this._transactions.get(transactionId);

    if (!context) {
      return {
        success: false,
        transactionId,
        state: TransactionState.FAILED,
        error: this._createError(
          transactionId,
          TransactionState.FAILED,
          'TRANSACTION_NOT_FOUND',
          `Transaction ${transactionId} not found`
        ),
      };
    }

    if (context.state !== TransactionState.ACTIVE) {
      return {
        success: false,
        transactionId,
        state: context.state,
        error: this._createError(
          transactionId,
          context.state,
          'INVALID_STATE',
          `Transaction is not in ACTIVE state`
        ),
      };
    }

    context.state = TransactionState.ROLLED_BACK;
    this._stats.activeTransactions--;
    this._stats.rolledBackTransactions++;

    const duration = Date.now() - context.startTime.getTime();
    this._updateAverageDuration(duration);

    return {
      success: true,
      transactionId,
      state: TransactionState.ROLLED_BACK,
    };
  }

  getTransaction(transactionId: string): TransactionContext | undefined {
    return this._transactions.get(transactionId);
  }

  getTransactionState(transactionId: string): TransactionState | undefined {
    const context = this._transactions.get(transactionId);
    return context?.state;
  }

  isActive(transactionId: string): boolean {
    const state = this.getTransactionState(transactionId);
    return state === TransactionState.ACTIVE;
  }

  async setIsolationLevel(transactionId: string, level: IsolationLevel): Promise<TransactionResult<void>> {
    const context = this._transactions.get(transactionId);

    if (!context) {
      return {
        success: false,
        transactionId,
        state: TransactionState.FAILED,
        error: this._createError(
          transactionId,
          TransactionState.FAILED,
          'TRANSACTION_NOT_FOUND',
          `Transaction ${transactionId} not found`
        ),
      };
    }

    context.snapshot.metadata.set('isolationLevel', level);

    return {
      success: true,
      transactionId,
      state: context.state,
    };
  }

  getStats(): TransactionStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      totalTransactions: 0,
      activeTransactions: this._stats.activeTransactions,
      committedTransactions: 0,
      rolledBackTransactions: 0,
      failedTransactions: 0,
      averageDuration: 0,
    };
  }

  setConfig(config: Partial<TransactionConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): TransactionConfig {
    return { ...this._config };
  }

  getActiveTransactions(): TransactionContext[] {
    const active: TransactionContext[] = [];

    for (const context of this._transactions.values()) {
      if (context.state === TransactionState.ACTIVE) {
        active.push(context);
      }
    }

    return active;
  }

  getCommittedTransactions(): string[] {
    const committed: string[] = [];

    for (const [id, context] of this._transactions) {
      if (context.state === TransactionState.COMMITTED) {
        committed.push(id);
      }
    }

    return committed;
  }

  getRolledBackTransactions(): string[] {
    const rolledBack: string[] = [];

    for (const [id, context] of this._transactions) {
      if (context.state === TransactionState.ROLLED_BACK) {
        rolledBack.push(id);
      }
    }

    return rolledBack;
  }

  cleanupExpiredTransactions(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, context] of this._transactions) {
      if (context.state === TransactionState.ACTIVE) {
        const duration = now - context.startTime.getTime();
        if (duration > this._config.timeout) {
          context.state = TransactionState.FAILED;
          this._stats.activeTransactions--;
          this._stats.failedTransactions++;
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  async setTimeout(transactionId: string, timeout: number): Promise<TransactionResult<void>> {
    const context = this._transactions.get(transactionId);

    if (!context) {
      return {
        success: false,
        transactionId,
        state: TransactionState.FAILED,
        error: this._createError(
          transactionId,
          TransactionState.FAILED,
          'TRANSACTION_NOT_FOUND',
          `Transaction ${transactionId} not found`
        ),
      };
    }

    context.snapshot.metadata.set('timeout', timeout);

    return {
      success: true,
      transactionId,
      state: context.state,
    };
  }

  getTimeout(transactionId: string): number | undefined {
    const context = this._transactions.get(transactionId);
    return context?.snapshot.metadata.get('timeout') as number | undefined;
  }

  private _generateTransactionId(): string {
    this._transactionIdCounter++;
    return `txn_${Date.now()}_${this._transactionIdCounter}`;
  }

  private _createError(
    transactionId: string,
    state: TransactionState,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): TransactionError {
    return {
      code,
      message,
      transactionId,
      state,
      details,
    };
  }

  private _updateAverageDuration(duration: number): void {
    const totalCompleted = this._stats.committedTransactions + this._stats.rolledBackTransactions;
    if (totalCompleted > 0) {
      this._stats.averageDuration =
        (this._stats.averageDuration * (totalCompleted - 1) + duration) / totalCompleted;
    }
  }

  addOperation(transactionId: string, operation: TransactionOperation): void {
    const context = this._transactions.get(transactionId);
    if (context) {
      context.operations.push(operation);
    }
  }
}
