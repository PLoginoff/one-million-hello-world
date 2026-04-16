/**
 * Transaction Layer Types
 * 
 * Type definitions for transaction management with isolation levels and rollback support.
 */

/**
 * Transaction state
 */
export enum TransactionState {
  ACTIVE = 'ACTIVE',
  COMMITTED = 'COMMITTED',
  ROLLED_BACK = 'ROLLED_BACK',
  FAILED = 'FAILED',
}

/**
 * Isolation level
 */
export enum IsolationLevel {
  READ_UNCOMMITTED = 'READ_UNCOMMITTED',
  READ_COMMITTED = 'READ_COMMITTED',
  REPEATABLE_READ = 'REPEATABLE_READ',
  SERIALIZABLE = 'SERIALIZABLE',
}

/**
 * Transaction configuration
 */
export interface TransactionConfig {
  isolationLevel: IsolationLevel;
  timeout: number;
  readOnly: boolean;
  autoCommit: boolean;
}

/**
 * Transaction context
 */
export interface TransactionContext {
  transactionId: string;
  state: TransactionState;
  startTime: Date;
  operations: TransactionOperation[];
  snapshot: TransactionSnapshot;
}

/**
 * Transaction operation
 */
export interface TransactionOperation {
  type: TransactionOperationType;
  timestamp: Date;
  data: unknown;
}

/**
 * Transaction operation type
 */
export enum TransactionOperationType {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
}

/**
 * Transaction snapshot
 */
export interface TransactionSnapshot {
  data: Map<string, unknown>;
  metadata: Map<string, unknown>;
}

/**
 * Transaction result
 */
export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  transactionId: string;
  state: TransactionState;
  error?: TransactionError;
}

/**
 * Transaction error
 */
export interface TransactionError {
  code: string;
  message: string;
  transactionId: string;
  state: TransactionState;
  details?: Record<string, unknown>;
}

/**
 * Transaction statistics
 */
export interface TransactionStats {
  totalTransactions: number;
  activeTransactions: number;
  committedTransactions: number;
  rolledBackTransactions: number;
  failedTransactions: number;
  averageDuration: number;
}
