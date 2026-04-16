/**
 * Transaction Manager Interface
 * 
 * Defines the contract for transaction management with isolation levels and rollback support.
 */

import {
  TransactionResult,
  TransactionConfig,
  TransactionContext,
  TransactionState,
  IsolationLevel,
  TransactionStats,
} from '../types/transaction-types';

/**
 * Interface for transaction management
 */
export interface ITransactionManager {
  /**
   * Begins a new transaction
   * 
   * @param config - Transaction configuration
   * @returns Transaction result with context
   */
  begin(config?: Partial<TransactionConfig>): Promise<TransactionResult<TransactionContext>>;

  /**
   * Commits a transaction
   * 
   * @param transactionId - Transaction ID
   * @returns Transaction result
   */
  commit(transactionId: string): Promise<TransactionResult<void>>;

  /**
   * Rolls back a transaction
   * 
   * @param transactionId - Transaction ID
   * @returns Transaction result
   */
  rollback(transactionId: string): Promise<TransactionResult<void>>;

  /**
   * Gets transaction context
   * 
   * @param transactionId - Transaction ID
   * @returns Transaction result with context
   */
  getTransaction(transactionId: string): TransactionContext | undefined;

  /**
   * Gets transaction state
   * 
   * @param transactionId - Transaction ID
   * @returns Transaction state
   */
  getTransactionState(transactionId: string): TransactionState | undefined;

  /**
   * Checks if a transaction is active
   * 
   * @param transactionId - Transaction ID
   * @returns Boolean indicating if transaction is active
   */
  isActive(transactionId: string): boolean;

  /**
   * Sets transaction isolation level
   * 
   * @param transactionId - Transaction ID
   * @param level - Isolation level
   * @returns Transaction result
   */
  setIsolationLevel(transactionId: string, level: IsolationLevel): Promise<TransactionResult<void>>;

  /**
   * Gets transaction statistics
   * 
   * @returns Transaction statistics
   */
  getStats(): TransactionStats;

  /**
   * Resets transaction statistics
   */
  resetStats(): void;

  /**
   * Sets transaction configuration
   * 
   * @param config - Transaction configuration
   */
  setConfig(config: Partial<TransactionConfig>): void;

  /**
   * Gets current transaction configuration
   * 
   * @returns Current transaction configuration
   */
  getConfig(): TransactionConfig;

  /**
   * Gets all active transactions
   * 
   * @returns Array of active transaction contexts
   */
  getActiveTransactions(): TransactionContext[];

  /**
   * Gets all committed transactions
   * 
   * @returns Array of committed transaction IDs
   */
  getCommittedTransactions(): string[];

  /**
   * Gets all rolled back transactions
   * 
   * @returns Array of rolled back transaction IDs
   */
  getRolledBackTransactions(): string[];

  /**
   * Cleans up expired transactions
   * 
   * @returns Number of transactions cleaned up
   */
  cleanupExpiredTransactions(): number;

  /**
   * Sets transaction timeout
   * 
   * @param transactionId - Transaction ID
   * @param timeout - Timeout in milliseconds
   * @returns Transaction result
   */
  setTimeout(transactionId: string, timeout: number): Promise<TransactionResult<void>>;

  /**
   * Gets transaction timeout
   * 
   * @param transactionId - Transaction ID
   * @returns Transaction timeout
   */
  getTimeout(transactionId: string): number | undefined;
}
