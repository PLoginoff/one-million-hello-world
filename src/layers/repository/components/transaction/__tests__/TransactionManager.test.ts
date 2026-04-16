/**
 * Transaction Manager Layer Tests
 * 
 * Comprehensive test suite for TransactionManager implementation.
 * Tests transaction lifecycle, isolation levels, rollback, and statistics.
 */

import { TransactionManager } from '../implementations/TransactionManager';
import { ITransactionManager } from '../interfaces/ITransactionManager';
import {
  TransactionState,
  IsolationLevel,
  TransactionOperationType,
} from '../types/transaction-types';

describe('TransactionManager', () => {
  let transactionManager: TransactionManager;

  beforeEach(() => {
    // Initialize TransactionManager before each test
    transactionManager = new TransactionManager();
  });

  describe('Initialization', () => {
    /**
     * Test that TransactionManager initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = transactionManager.getConfig();
      expect(config.isolationLevel).toBe(IsolationLevel.READ_COMMITTED);
      expect(config.timeout).toBe(30000);
      expect(config.readOnly).toBe(false);
      expect(config.autoCommit).toBe(false);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = transactionManager.getStats();
      expect(stats.totalTransactions).toBe(0);
      expect(stats.activeTransactions).toBe(0);
      expect(stats.committedTransactions).toBe(0);
      expect(stats.rolledBackTransactions).toBe(0);
    });
  });

  describe('Transaction Lifecycle', () => {
    /**
     * Test beginning a new transaction successfully
     */
    it('should begin a new transaction successfully', async () => {
      const result = await transactionManager.begin();

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.state).toBe(TransactionState.ACTIVE);

      const stats = transactionManager.getStats();
      expect(stats.totalTransactions).toBe(1);
      expect(stats.activeTransactions).toBe(1);
    });

    /**
     * Test committing an active transaction successfully
     */
    it('should commit an active transaction successfully', async () => {
      const beginResult = await transactionManager.begin();
      const commitResult = await transactionManager.commit(beginResult.transactionId);

      expect(commitResult.success).toBe(true);
      expect(commitResult.state).toBe(TransactionState.COMMITTED);

      const stats = transactionManager.getStats();
      expect(stats.activeTransactions).toBe(0);
      expect(stats.committedTransactions).toBe(1);
    });

    /**
     * Test rolling back an active transaction successfully
     */
    it('should rollback an active transaction successfully', async () => {
      const beginResult = await transactionManager.begin();
      const rollbackResult = await transactionManager.rollback(beginResult.transactionId);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.state).toBe(TransactionState.ROLLED_BACK);

      const stats = transactionManager.getStats();
      expect(stats.activeTransactions).toBe(0);
      expect(stats.rolledBackTransactions).toBe(1);
    });

    /**
     * Test committing a non-existent transaction fails
     */
    it('should fail when committing non-existent transaction', async () => {
      const result = await transactionManager.commit('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
      expect(result.state).toBe(TransactionState.FAILED);
    });

    /**
     * Test rolling back a non-existent transaction fails
     */
    it('should fail when rolling back non-existent transaction', async () => {
      const result = await transactionManager.rollback('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
      expect(result.state).toBe(TransactionState.FAILED);
    });

    /**
     * Test committing a committed transaction fails
     */
    it('should fail when committing already committed transaction', async () => {
      const beginResult = await transactionManager.begin();
      await transactionManager.commit(beginResult.transactionId);
      const commitAgain = await transactionManager.commit(beginResult.transactionId);

      expect(commitAgain.success).toBe(false);
      expect(commitAgain.error?.code).toBe('INVALID_STATE');
    });

    /**
     * Test rolling back a rolled back transaction fails
     */
    it('should fail when rolling back already rolled back transaction', async () => {
      const beginResult = await transactionManager.begin();
      await transactionManager.rollback(beginResult.transactionId);
      const rollbackAgain = await transactionManager.rollback(beginResult.transactionId);

      expect(rollbackAgain.success).toBe(false);
      expect(rollbackAgain.error?.code).toBe('INVALID_STATE');
    });
  });

  describe('Transaction State', () => {
    /**
     * Test getTransaction returns transaction context
     */
    it('should return transaction context', async () => {
      const beginResult = await transactionManager.begin();
      const context = transactionManager.getTransaction(beginResult.transactionId);

      expect(context).toBeDefined();
      expect(context?.transactionId).toBe(beginResult.transactionId);
      expect(context?.state).toBe(TransactionState.ACTIVE);
    });

    /**
     * Test getTransactionState returns state
     */
    it('should return transaction state', async () => {
      const beginResult = await transactionManager.begin();
      const state = transactionManager.getTransactionState(beginResult.transactionId);

      expect(state).toBe(TransactionState.ACTIVE);
    });

    /**
     * Test isActive returns true for active transaction
     */
    it('should return true for active transaction', async () => {
      const beginResult = await transactionManager.begin();
      const isActive = transactionManager.isActive(beginResult.transactionId);

      expect(isActive).toBe(true);
    });

    /**
     * Test isActive returns false for committed transaction
     */
    it('should return false for committed transaction', async () => {
      const beginResult = await transactionManager.begin();
      await transactionManager.commit(beginResult.transactionId);
      const isActive = transactionManager.isActive(beginResult.transactionId);

      expect(isActive).toBe(false);
    });

    /**
     * Test isActive returns false for non-existent transaction
     */
    it('should return false for non-existent transaction', () => {
      const isActive = transactionManager.isActive('non-existent');
      expect(isActive).toBe(false);
    });
  });

  describe('Isolation Levels', () => {
    /**
     * Test setting isolation level for transaction
     */
    it('should set isolation level for transaction', async () => {
      const beginResult = await transactionManager.begin();
      const result = await transactionManager.setIsolationLevel(
        beginResult.transactionId,
        IsolationLevel.SERIALIZABLE
      );

      expect(result.success).toBe(true);
    });

    /**
     * Test setting isolation level on non-existent transaction fails
     */
    it('should fail when setting isolation level on non-existent transaction', async () => {
      const result = await transactionManager.setIsolationLevel(
        'non-existent',
        IsolationLevel.SERIALIZABLE
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  describe('Timeout Management', () => {
    /**
     * Test setting timeout for transaction
     */
    it('should set timeout for transaction', async () => {
      const beginResult = await transactionManager.begin();
      const result = await transactionManager.setTimeout(beginResult.transactionId, 5000);

      expect(result.success).toBe(true);
    });

    /**
     * Test getting timeout for transaction
     */
    it('should get timeout for transaction', async () => {
      const beginResult = await transactionManager.begin();
      await transactionManager.setTimeout(beginResult.transactionId, 5000);
      const timeout = transactionManager.getTimeout(beginResult.transactionId);

      expect(timeout).toBe(5000);
    });

    /**
     * Test cleanup expired transactions marks them as failed
     */
    it('should cleanup expired transactions', async () => {
      const config = { timeout: 100 };
      transactionManager.setConfig(config);

      await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const cleaned = transactionManager.cleanupExpiredTransactions();
      expect(cleaned).toBeGreaterThan(0);

      const stats = transactionManager.getStats();
      expect(stats.failedTransactions).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total transactions correctly
     */
    it('should track total transactions correctly', async () => {
      await transactionManager.begin();
      await transactionManager.begin();
      await transactionManager.begin();

      const stats = transactionManager.getStats();
      expect(stats.totalTransactions).toBe(3);
    });

    /**
     * Test stats track committed transactions correctly
     */
    it('should track committed transactions correctly', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      await transactionManager.commit(txn1.transactionId);
      await transactionManager.commit(txn2.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.committedTransactions).toBe(2);
    });

    /**
     * Test stats track rolled back transactions correctly
     */
    it('should track rolled back transactions correctly', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      await transactionManager.rollback(txn1.transactionId);
      await transactionManager.rollback(txn2.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.rolledBackTransactions).toBe(2);
    });

    /**
     * Test stats track average duration correctly
     */
    it('should track average duration correctly', async () => {
      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await transactionManager.commit(txn.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      await transactionManager.begin();
      await transactionManager.begin();

      transactionManager.resetStats();
      const stats = transactionManager.getStats();

      expect(stats.totalTransactions).toBe(0);
      expect(stats.activeTransactions).toBe(0);
    });
  });

  describe('Active Transactions', () => {
    /**
     * Test getActiveTransactions returns active transactions
     */
    it('should return active transactions', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      const active = transactionManager.getActiveTransactions();
      expect(active.length).toBe(2);
      expect(active.map((t) => t.transactionId)).toContain(txn1.transactionId);
      expect(active.map((t) => t.transactionId)).toContain(txn2.transactionId);
    });

    /**
     * Test getCommittedTransactions returns committed transaction IDs
     */
    it('should return committed transaction IDs', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      await transactionManager.commit(txn1.transactionId);

      const committed = transactionManager.getCommittedTransactions();
      expect(committed).toContain(txn1.transactionId);
      expect(committed).not.toContain(txn2.transactionId);
    });

    /**
     * Test getRolledBackTransactions returns rolled back transaction IDs
     */
    it('should return rolled back transaction IDs', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      await transactionManager.rollback(txn1.transactionId);

      const rolledBack = transactionManager.getRolledBackTransactions();
      expect(rolledBack).toContain(txn1.transactionId);
      expect(rolledBack).not.toContain(txn2.transactionId);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        isolationLevel: IsolationLevel.SERIALIZABLE,
        timeout: 60000,
        readOnly: true,
      };

      transactionManager.setConfig(newConfig);
      const config = transactionManager.getConfig();

      expect(config.isolationLevel).toBe(IsolationLevel.SERIALIZABLE);
      expect(config.timeout).toBe(60000);
      expect(config.readOnly).toBe(true);
    });
  });

  describe('Transaction Operations', () => {
    /**
     * Test addOperation adds operation to transaction
     */
    it('should add operation to transaction', async () => {
      const txn = await transactionManager.begin();

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.READ,
        timestamp: new Date(),
        data: {},
      });

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(1);
    });
  });

  describe('Multiple Transactions', () => {
    /**
     * Test handling multiple concurrent transactions
     */
    it('should handle multiple concurrent transactions', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();
      const txn3 = await transactionManager.begin();

      await transactionManager.commit(txn1.transactionId);
      await transactionManager.rollback(txn2.transactionId);
      await transactionManager.commit(txn3.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.committedTransactions).toBe(2);
      expect(stats.rolledBackTransactions).toBe(1);
      expect(stats.totalTransactions).toBe(3);
    });

    /**
     * Test handling many concurrent transactions efficiently
     */
    it('should handle many concurrent transactions efficiently', async () => {
      const transactions = [];
      for (let i = 0; i < 100; i++) {
        const txn = await transactionManager.begin();
        transactions.push(txn);
      }

      const stats = transactionManager.getStats();
      expect(stats.totalTransactions).toBe(100);
      expect(stats.activeTransactions).toBe(100);
    });

    /**
     * Test transaction isolation between concurrent transactions
     */
    it('should maintain isolation between concurrent transactions', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      transactionManager.addOperation(txn1.transactionId, {
        type: TransactionOperationType.WRITE,
        timestamp: new Date(),
        data: { key: 'value1' },
      });

      transactionManager.addOperation(txn2.transactionId, {
        type: TransactionOperationType.WRITE,
        timestamp: new Date(),
        data: { key: 'value2' },
      });

      const context1 = transactionManager.getTransaction(txn1.transactionId);
      const context2 = transactionManager.getTransaction(txn2.transactionId);

      expect(context1?.operations.length).toBe(1);
      expect(context2?.operations.length).toBe(1);
      expect(context1?.operations[0].data).toEqual({ key: 'value1' });
      expect(context2?.operations[0].data).toEqual({ key: 'value2' });
    });
  });

  describe('All Isolation Levels', () => {
    /**
     * Test READ_UNCOMMITTED isolation level
     */
    it('should set READ_UNCOMMITTED isolation level', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.READ_UNCOMMITTED
      );

      expect(result.success).toBe(true);
    });

    /**
     * Test READ_COMMITTED isolation level
     */
    it('should set READ_COMMITTED isolation level', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.READ_COMMITTED
      );

      expect(result.success).toBe(true);
    });

    /**
     * Test REPEATABLE_READ isolation level
     */
    it('should set REPEATABLE_READ isolation level', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.REPEATABLE_READ
      );

      expect(result.success).toBe(true);
    });

    /**
     * Test SERIALIZABLE isolation level
     */
    it('should set SERIALIZABLE isolation level', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.SERIALIZABLE
      );

      expect(result.success).toBe(true);
    });

    /**
     * Test changing isolation level multiple times
     */
    it('should allow changing isolation level multiple times', async () => {
      const txn = await transactionManager.begin();

      await transactionManager.setIsolationLevel(txn.transactionId, IsolationLevel.READ_UNCOMMITTED);
      await transactionManager.setIsolationLevel(txn.transactionId, IsolationLevel.READ_COMMITTED);
      await transactionManager.setIsolationLevel(txn.transactionId, IsolationLevel.REPEATABLE_READ);
      await transactionManager.setIsolationLevel(txn.transactionId, IsolationLevel.SERIALIZABLE);

      const result = await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.READ_COMMITTED
      );

      expect(result.success).toBe(true);
    });

    /**
     * Test setting isolation level on committed transaction fails
     */
    it('should fail when setting isolation level on committed transaction', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const result = await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.SERIALIZABLE
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  describe('Transaction Operation Types', () => {
    /**
     * Test adding READ operation
     */
    it('should add READ operation to transaction', async () => {
      const txn = await transactionManager.begin();

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.READ,
        timestamp: new Date(),
        data: { key: 'test' },
      });

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(1);
      expect(context?.operations[0].type).toBe(TransactionOperationType.READ);
    });

    /**
     * Test adding WRITE operation
     */
    it('should add WRITE operation to transaction', async () => {
      const txn = await transactionManager.begin();

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.WRITE,
        timestamp: new Date(),
        data: { key: 'value' },
      });

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(1);
      expect(context?.operations[0].type).toBe(TransactionOperationType.WRITE);
    });

    /**
     * Test adding DELETE operation
     */
    it('should add DELETE operation to transaction', async () => {
      const txn = await transactionManager.begin();

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.DELETE,
        timestamp: new Date(),
        data: { key: 'to-delete' },
      });

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(1);
      expect(context?.operations[0].type).toBe(TransactionOperationType.DELETE);
    });

    /**
     * Test adding multiple operations to transaction
     */
    it('should add multiple operations to transaction', async () => {
      const txn = await transactionManager.begin();

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.READ,
        timestamp: new Date(),
        data: { key: 'test' },
      });

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.WRITE,
        timestamp: new Date(),
        data: { key: 'value' },
      });

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.DELETE,
        timestamp: new Date(),
        data: { key: 'to-delete' },
      });

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(3);
    });

    /**
     * Test adding operation to non-existent transaction does nothing
     */
    it('should handle adding operation to non-existent transaction', () => {
      transactionManager.addOperation('non-existent', {
        type: TransactionOperationType.READ,
        timestamp: new Date(),
        data: {},
      });

      // Should not throw error
    });

    /**
     * Test operation timestamp accuracy
     */
    it('should record accurate operation timestamp', async () => {
      const beforeTime = new Date();
      const txn = await transactionManager.begin();
      const afterTime = new Date();

      transactionManager.addOperation(txn.transactionId, {
        type: TransactionOperationType.READ,
        timestamp: new Date(),
        data: {},
      });

      const context = transactionManager.getTransaction(txn.transactionId);
      const opTime = context?.operations[0].timestamp;

      if (opTime) {
        expect(opTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(opTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      }
    });
  });

  describe('Snapshot Management', () => {
    /**
     * Test snapshot is created on transaction begin
     */
    it('should create snapshot on transaction begin', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      expect(context?.snapshot).toBeDefined();
      expect(context?.snapshot.data).toBeInstanceOf(Map);
      expect(context?.snapshot.metadata).toBeInstanceOf(Map);
    });

    /**
     * Test snapshot data can be accessed
     */
    it('should allow access to snapshot data', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key1', 'value1');
      expect(context?.snapshot.data.get('key1')).toBe('value1');
    });

    /**
     * Test snapshot metadata can be accessed
     */
    it('should allow access to snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.metadata.set('metaKey', 'metaValue');
      expect(context?.snapshot.metadata.get('metaKey')).toBe('metaValue');
    });

    /**
     * Test snapshot stores isolation level in metadata
     */
    it('should store isolation level in snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.setIsolationLevel(
        txn.transactionId,
        IsolationLevel.SERIALIZABLE
      );

      const context = transactionManager.getTransaction(txn.transactionId);
      const isolationLevel = context?.snapshot.metadata.get('isolationLevel');

      expect(isolationLevel).toBe(IsolationLevel.SERIALIZABLE);
    });

    /**
     * Test snapshot stores timeout in metadata
     */
    it('should store timeout in snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.setTimeout(txn.transactionId, 10000);

      const context = transactionManager.getTransaction(txn.transactionId);
      const timeout = context?.snapshot.metadata.get('timeout');

      expect(timeout).toBe(10000);
    });

    /**
     * Test snapshot persists after commit
     */
    it('should persist snapshot after commit', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key', 'value');
      await transactionManager.commit(txn.transactionId);

      const committedContext = transactionManager.getTransaction(txn.transactionId);
      expect(committedContext?.snapshot.data.get('key')).toBe('value');
    });

    /**
     * Test snapshot persists after rollback
     */
    it('should persist snapshot after rollback', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key', 'value');
      await transactionManager.rollback(txn.transactionId);

      const rolledBackContext = transactionManager.getTransaction(txn.transactionId);
      expect(rolledBackContext?.snapshot.data.get('key')).toBe('value');
    });

    /**
     * Test snapshot data can hold complex objects
     */
    it('should store complex objects in snapshot data', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      const complexObject = {
        nested: {
          array: [1, 2, 3],
          string: 'test',
        },
      };

      context?.snapshot.data.set('complex', complexObject);
      expect(context?.snapshot.data.get('complex')).toEqual(complexObject);
    });

    /**
     * Test snapshot metadata can hold complex objects
     */
    it('should store complex objects in snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      const complexMetadata = {
        userId: 123,
        permissions: ['read', 'write'],
      };

      context?.snapshot.metadata.set('user', complexMetadata);
      expect(context?.snapshot.metadata.get('user')).toEqual(complexMetadata);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test error includes transaction ID
     */
    it('should include transaction ID in error', async () => {
      const result = await transactionManager.commit('non-existent');

      expect(result.error?.transactionId).toBe('non-existent');
    });

    /**
     * Test error includes state
     */
    it('should include state in error', async () => {
      const result = await transactionManager.commit('non-existent');

      expect(result.error?.state).toBe(TransactionState.FAILED);
    });

    /**
     * Test error includes message
     */
    it('should include message in error', async () => {
      const result = await transactionManager.commit('non-existent');

      expect(result.error?.message).toContain('not found');
    });

    /**
     * Test error includes code
     */
    it('should include code in error', async () => {
      const result = await transactionManager.commit('non-existent');

      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test error can include details
     */
    it('should handle error with details', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const result = await transactionManager.commit(txn.transactionId);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_STATE');
    });

    /**
     * Test invalid state error for committed transaction
     */
    it('should return invalid state error for committed transaction', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const result = await transactionManager.commit(txn.transactionId);
      expect(result.error?.code).toBe('INVALID_STATE');
      expect(result.error?.state).toBe(TransactionState.COMMITTED);
    });

    /**
     * Test invalid state error for rolled back transaction
     */
    it('should return invalid state error for rolled back transaction', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.rollback(txn.transactionId);

      const result = await transactionManager.rollback(txn.transactionId);
      expect(result.error?.code).toBe('INVALID_STATE');
      expect(result.error?.state).toBe(TransactionState.ROLLED_BACK);
    });
  });

  describe('Transaction ID Generation', () => {
    /**
     * Test transaction IDs are unique
     */
    it('should generate unique transaction IDs', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();
      const txn3 = await transactionManager.begin();

      expect(txn1.transactionId).not.toBe(txn2.transactionId);
      expect(txn2.transactionId).not.toBe(txn3.transactionId);
      expect(txn1.transactionId).not.toBe(txn3.transactionId);
    });

    /**
     * Test transaction ID format
     */
    it('should generate transaction ID with correct format', async () => {
      const txn = await transactionManager.begin();

      expect(txn.transactionId).toMatch(/^txn_\d+_\d+$/);
    });

    /**
     * Test transaction ID includes timestamp
     */
    it('should include timestamp in transaction ID', async () => {
      const beforeTime = Date.now();
      const txn = await transactionManager.begin();
      const afterTime = Date.now();

      const timestamp = parseInt(txn.transactionId.split('_')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    /**
     * Test transaction ID includes counter
     */
    it('should include counter in transaction ID', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      const counter1 = parseInt(txn1.transactionId.split('_')[2]);
      const counter2 = parseInt(txn2.transactionId.split('_')[2]);

      expect(counter2).toBe(counter1 + 1);
    });

    /**
     * Test transaction ID counter increments correctly
     */
    it('should increment transaction ID counter correctly', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();
      const txn3 = await transactionManager.begin();

      const counter1 = parseInt(txn1.transactionId.split('_')[2]);
      const counter2 = parseInt(txn2.transactionId.split('_')[2]);
      const counter3 = parseInt(txn3.transactionId.split('_')[2]);

      expect(counter2).toBe(counter1 + 1);
      expect(counter3).toBe(counter2 + 1);
    });
  });

  describe('Custom Transaction Configuration', () => {
    /**
     * Test begin with custom isolation level
     */
    it('should begin with custom isolation level', async () => {
      const txn = await transactionManager.begin({
        isolationLevel: IsolationLevel.SERIALIZABLE,
      });

      expect(txn.success).toBe(true);
    });

    /**
     * Test begin with custom timeout
     */
    it('should begin with custom timeout', async () => {
      const txn = await transactionManager.begin({
        timeout: 5000,
      });

      expect(txn.success).toBe(true);
      expect(transactionManager.getTimeout(txn.transactionId)).toBe(5000);
    });

    /**
     * Test begin with readOnly flag
     */
    it('should begin with readOnly flag', async () => {
      const txn = await transactionManager.begin({
        readOnly: true,
      });

      expect(txn.success).toBe(true);
    });

    /**
     * Test begin with autoCommit flag
     */
    it('should begin with autoCommit flag', async () => {
      const txn = await transactionManager.begin({
        autoCommit: true,
      });

      expect(txn.success).toBe(true);
    });

    /**
     * Test begin with multiple custom options
     */
    it('should begin with multiple custom options', async () => {
      const txn = await transactionManager.begin({
        isolationLevel: IsolationLevel.REPEATABLE_READ,
        timeout: 10000,
        readOnly: false,
        autoCommit: false,
      });

      expect(txn.success).toBe(true);
    });

    /**
     * Test custom config does not affect global config
     */
    it('should not affect global config with custom transaction config', async () => {
      const globalConfig = transactionManager.getConfig();

      await transactionManager.begin({
        isolationLevel: IsolationLevel.SERIALIZABLE,
        timeout: 5000,
      });

      const currentConfig = transactionManager.getConfig();
      expect(currentConfig.isolationLevel).toBe(globalConfig.isolationLevel);
      expect(currentConfig.timeout).toBe(globalConfig.timeout);
    });
  });

  describe('Timeout Edge Cases', () => {
    /**
     * Test setting timeout to zero
     */
    it('should allow setting timeout to zero', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setTimeout(txn.transactionId, 0);

      expect(result.success).toBe(true);
      expect(transactionManager.getTimeout(txn.transactionId)).toBe(0);
    });

    /**
     * Test setting timeout to negative value
     */
    it('should allow setting timeout to negative value', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setTimeout(txn.transactionId, -1);

      expect(result.success).toBe(true);
    });

    /**
     * Test setting timeout to very large value
     */
    it('should allow setting timeout to very large value', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.setTimeout(txn.transactionId, Number.MAX_SAFE_INTEGER);

      expect(result.success).toBe(true);
    });

    /**
     * Test getting timeout returns undefined when not set
     */
    it('should return undefined for unset timeout', async () => {
      const txn = await transactionManager.begin();
      const timeout = transactionManager.getTimeout(txn.transactionId);

      expect(timeout).toBeUndefined();
    });

    /**
     * Test getting timeout for non-existent transaction
     */
    it('should return undefined for non-existent transaction timeout', () => {
      const timeout = transactionManager.getTimeout('non-existent');
      expect(timeout).toBeUndefined();
    });

    /**
     * Test cleanup respects custom timeout
     */
    it('should cleanup with custom timeout', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.setTimeout(txn.transactionId, 50);
      await new Promise((resolve) => setTimeout(resolve, 60));

      const cleaned = transactionManager.cleanupExpiredTransactions();
      expect(cleaned).toBeGreaterThan(0);
    });
  });

  describe('State Transition Edge Cases', () => {
    /**
     * Test transaction cannot transition from COMMITTED to ROLLED_BACK
     */
    it('should not allow transition from COMMITTED to ROLLED_BACK', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const result = await transactionManager.rollback(txn.transactionId);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test transaction cannot transition from ROLLED_BACK to COMMITTED
     */
    it('should not allow transition from ROLLED_BACK to COMMITTED', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.rollback(txn.transactionId);

      const result = await transactionManager.commit(txn.transactionId);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test transaction cannot transition from FAILED to COMMITTED
     */
    it('should not allow transition from FAILED to COMMITTED', async () => {
      const config = { timeout: 10 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 20));
      transactionManager.cleanupExpiredTransactions();

      const result = await transactionManager.commit(txn.transactionId);
      expect(result.success).toBe(false);
    });

    /**
     * Test transaction cannot transition from FAILED to ROLLED_BACK
     */
    it('should not allow transition from FAILED to ROLLED_BACK', async () => {
      const config = { timeout: 10 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 20));
      transactionManager.cleanupExpiredTransactions();

      const result = await transactionManager.rollback(txn.transactionId);
      expect(result.success).toBe(false);
    });
  });

  describe('Statistics Accuracy', () => {
    /**
     * Test average duration calculation with single transaction
     */
    it('should calculate average duration correctly with single transaction', async () => {
      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transactionManager.commit(txn.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.averageDuration).toBeGreaterThanOrEqual(50);
    });

    /**
     * Test average duration calculation with multiple transactions
     */
    it('should calculate average duration correctly with multiple transactions', async () => {
      const txn1 = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await transactionManager.commit(txn1.transactionId);

      const txn2 = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 30));
      await transactionManager.commit(txn2.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    /**
     * Test failed transactions are tracked in stats
     */
    it('should track failed transactions in stats', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const stats = transactionManager.getStats();
      expect(stats.failedTransactions).toBeGreaterThan(0);
    });

    /**
     * Test stats are immutable copies
     */
    it('should return immutable copy of stats', () => {
      const stats1 = transactionManager.getStats();
      const stats2 = transactionManager.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });

    /**
     * Test resetStats preserves active transactions count
     */
    it('should preserve active transactions count on reset', async () => {
      await transactionManager.begin();
      await transactionManager.begin();

      transactionManager.resetStats();
      const stats = transactionManager.getStats();

      expect(stats.activeTransactions).toBe(2);
    });

    /**
     * Test resetStats clears other counters
     */
    it('should clear other counters on reset', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();

      await transactionManager.commit(txn1.transactionId);
      await transactionManager.rollback(txn2.transactionId);

      transactionManager.resetStats();
      const stats = transactionManager.getStats();

      expect(stats.totalTransactions).toBe(0);
      expect(stats.committedTransactions).toBe(0);
      expect(stats.rolledBackTransactions).toBe(0);
      expect(stats.failedTransactions).toBe(0);
      expect(stats.averageDuration).toBe(0);
    });
  });

  describe('Configuration Edge Cases', () => {
    /**
     * Test config returns immutable copy
     */
    it('should return immutable copy of config', () => {
      const config1 = transactionManager.getConfig();
      const config2 = transactionManager.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    /**
     * Test setConfig with partial config
     */
    it('should merge partial config with existing config', () => {
      const originalConfig = transactionManager.getConfig();

      transactionManager.setConfig({ timeout: 60000 });
      const newConfig = transactionManager.getConfig();

      expect(newConfig.timeout).toBe(60000);
      expect(newConfig.isolationLevel).toBe(originalConfig.isolationLevel);
      expect(newConfig.readOnly).toBe(originalConfig.readOnly);
      expect(newConfig.autoCommit).toBe(originalConfig.autoCommit);
    });

    /**
     * Test setConfig affects new transactions
     */
    it('should affect new transactions when config is updated', () => {
      transactionManager.setConfig({ timeout: 10000 });
      const config = transactionManager.getConfig();

      expect(config.timeout).toBe(10000);
    });

    /**
     * Test setConfig with empty object
     */
    it('should handle setConfig with empty object', () => {
      const originalConfig = transactionManager.getConfig();

      transactionManager.setConfig({});
      const newConfig = transactionManager.getConfig();

      expect(newConfig).toEqual(originalConfig);
    });
  });

  describe('Failed Transactions', () => {
    /**
     * Test cleanup marks transaction as FAILED
     */
    it('should mark expired transaction as FAILED', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.state).toBe(TransactionState.FAILED);
    });

    /**
     * Test getTransaction returns failed transaction
     */
    it('should return failed transaction context', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context).toBeDefined();
      expect(context?.state).toBe(TransactionState.FAILED);
    });

    /**
     * Test getTransactionState returns FAILED for expired transaction
     */
    it('should return FAILED state for expired transaction', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const state = transactionManager.getTransactionState(txn.transactionId);
      expect(state).toBe(TransactionState.FAILED);
    });

    /**
     * Test isActive returns false for failed transaction
     */
    it('should return false for failed transaction', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const isActive = transactionManager.isActive(txn.transactionId);
      expect(isActive).toBe(false);
    });

    /**
     * Test failed transactions are not in active list
     */
    it('should not include failed transactions in active list', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const active = transactionManager.getActiveTransactions();
      expect(active).not.toContainEqual(
        expect.objectContaining({ transactionId: txn.transactionId })
      );
    });
  });

  describe('Performance Tests', () => {
    /**
     * Test begin performance with many transactions
     */
    it('should handle high volume of begin operations', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await transactionManager.begin();
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    });

    /**
     * Test commit performance with many transactions
     */
    it('should handle high volume of commit operations', async () => {
      const transactions = [];
      for (let i = 0; i < 100; i++) {
        const txn = await transactionManager.begin();
        transactions.push(txn);
      }

      const startTime = Date.now();
      for (const txn of transactions) {
        await transactionManager.commit(txn.transactionId);
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    /**
     * Test rollback performance with many transactions
     */
    it('should handle high volume of rollback operations', async () => {
      const transactions = [];
      for (let i = 0; i < 100; i++) {
        const txn = await transactionManager.begin();
        transactions.push(txn);
      }

      const startTime = Date.now();
      for (const txn of transactions) {
        await transactionManager.rollback(txn.transactionId);
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    /**
     * Test getTransaction performance
     */
    it('should handle high volume of getTransaction operations', async () => {
      const txn = await transactionManager.begin();

      const startTime = Date.now();
      for (let i = 0; i < 10000; i++) {
        transactionManager.getTransaction(txn.transactionId);
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    /**
     * Test addOperation performance
     */
    it('should handle high volume of addOperation operations', async () => {
      const txn = await transactionManager.begin();

      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        transactionManager.addOperation(txn.transactionId, {
          type: TransactionOperationType.READ,
          timestamp: new Date(),
          data: { index: i },
        });
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(1000);
    });
  });

  describe('Memory Management', () => {
    /**
     * Test transactions are stored in memory
     */
    it('should store transactions in memory', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      expect(context).toBeDefined();
    });

    /**
     * Test committed transactions remain in memory
     */
    it('should keep committed transactions in memory', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context).toBeDefined();
    });

    /**
     * Test rolled back transactions remain in memory
     */
    it('should keep rolled back transactions in memory', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.rollback(txn.transactionId);

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context).toBeDefined();
    });

    /**
     * Test failed transactions remain in memory
     */
    it('should keep failed transactions in memory', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context).toBeDefined();
    });

    /**
     * Test large number of transactions in memory
     */
    it('should handle large number of transactions in memory', async () => {
      const transactions = [];
      for (let i = 0; i < 1000; i++) {
        const txn = await transactionManager.begin();
        transactions.push(txn);
      }

      for (const txn of transactions) {
        const context = transactionManager.getTransaction(txn.transactionId);
        expect(context).toBeDefined();
      }
    });
  });

  describe('Transaction Context Details', () => {
    /**
     * Test transaction context includes start time
     */
    it('should include start time in context', async () => {
      const beforeTime = new Date();
      const txn = await transactionManager.begin();
      const afterTime = new Date();

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.startTime).toBeDefined();
      expect(context?.startTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(context?.startTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    /**
     * Test transaction context includes transaction ID
     */
    it('should include transaction ID in context', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      expect(context?.transactionId).toBe(txn.transactionId);
    });

    /**
     * Test transaction context includes state
     */
    it('should include state in context', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      expect(context?.state).toBe(TransactionState.ACTIVE);
    });

    /**
     * Test transaction context includes operations array
     */
    it('should include operations array in context', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      expect(context?.operations).toEqual([]);
    });

    /**
     * Test transaction context includes snapshot
     */
    it('should include snapshot in context', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      expect(context?.snapshot).toBeDefined();
    });
  });

  describe('Cleanup Operations', () => {
    /**
     * Test cleanup does not affect active transactions within timeout
     */
    it('should not cleanup active transactions within timeout', async () => {
      const config = { timeout: 10000 };
      transactionManager.setConfig(config);

      await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cleaned = transactionManager.cleanupExpiredTransactions();
      expect(cleaned).toBe(0);
    });

    /**
     * Test cleanup only affects expired transactions
     */
    it('should only cleanup expired transactions', async () => {
      const config = { timeout: 100 };
      transactionManager.setConfig(config);

      const txn1 = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const txn2 = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const cleaned = transactionManager.cleanupExpiredTransactions();
      expect(cleaned).toBe(1);

      const context1 = transactionManager.getTransaction(txn1.transactionId);
      expect(context1?.state).toBe(TransactionState.FAILED);

      const context2 = transactionManager.getTransaction(txn2.transactionId);
      expect(context2?.state).toBe(TransactionState.ACTIVE);
    });

    /**
     * Test cleanup returns count of cleaned transactions
     */
    it('should return count of cleaned transactions', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      await transactionManager.begin();
      await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const cleaned = transactionManager.cleanupExpiredTransactions();
      expect(cleaned).toBe(2);
    });

    /**
     * Test cleanup with no expired transactions
     */
    it('should return 0 when no expired transactions', () => {
      const cleaned = transactionManager.cleanupExpiredTransactions();
      expect(cleaned).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    /**
     * Test concurrent begin operations
     */
    it('should handle concurrent begin operations', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(transactionManager.begin());
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    /**
     * Test concurrent commit operations
     */
    it('should handle concurrent commit operations', async () => {
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        const txn = await transactionManager.begin();
        transactions.push(txn);
      }

      const promises = transactions.map((t) => transactionManager.commit(t.transactionId));
      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    /**
     * Test concurrent rollback operations
     */
    it('should handle concurrent rollback operations', async () => {
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        const txn = await transactionManager.begin();
        transactions.push(txn);
      }

      const promises = transactions.map((t) => transactionManager.rollback(t.transactionId));
      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    /**
     * Test mixed concurrent operations
     */
    it('should handle mixed concurrent operations', async () => {
      const txn1 = await transactionManager.begin();
      const txn2 = await transactionManager.begin();
      const txn3 = await transactionManager.begin();

      const results = await Promise.all([
        transactionManager.commit(txn1.transactionId),
        transactionManager.rollback(txn2.transactionId),
        transactionManager.commit(txn3.transactionId),
      ]);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('Transaction Result Structure', () => {
    /**
     * Test successful begin result structure
     */
    it('should return correct structure for successful begin', async () => {
      const result = await transactionManager.begin();

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.state).toBe(TransactionState.ACTIVE);
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    /**
     * Test successful commit result structure
     */
    it('should return correct structure for successful commit', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.commit(txn.transactionId);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe(txn.transactionId);
      expect(result.state).toBe(TransactionState.COMMITTED);
      expect(result.error).toBeUndefined();
    });

    /**
     * Test successful rollback result structure
     */
    it('should return correct structure for successful rollback', async () => {
      const txn = await transactionManager.begin();
      const result = await transactionManager.rollback(txn.transactionId);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe(txn.transactionId);
      expect(result.state).toBe(TransactionState.ROLLED_BACK);
      expect(result.error).toBeUndefined();
    });

    /**
     * Test failed operation result structure
     */
    it('should return correct structure for failed operation', async () => {
      const result = await transactionManager.commit('non-existent');

      expect(result.success).toBe(false);
      expect(result.transactionId).toBe('non-existent');
      expect(result.state).toBe(TransactionState.FAILED);
      expect(result.error).toBeDefined();
    });
  });

  describe('Edge Cases and Invalid Inputs', () => {
    /**
     * Test getTransaction with empty string
     */
    it('should handle getTransaction with empty string', () => {
      const context = transactionManager.getTransaction('');
      expect(context).toBeUndefined();
    });

    /**
     * Test getTransactionState with empty string
     */
    it('should handle getTransactionState with empty string', () => {
      const state = transactionManager.getTransactionState('');
      expect(state).toBeUndefined();
    });

    /**
     * Test isActive with empty string
     */
    it('should handle isActive with empty string', () => {
      const isActive = transactionManager.isActive('');
      expect(isActive).toBe(false);
    });

    /**
     * Test commit with empty string
     */
    it('should handle commit with empty string', async () => {
      const result = await transactionManager.commit('');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test rollback with empty string
     */
    it('should handle rollback with empty string', async () => {
      const result = await transactionManager.rollback('');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test setIsolationLevel with empty string
     */
    it('should handle setIsolationLevel with empty string', async () => {
      const result = await transactionManager.setIsolationLevel('', IsolationLevel.SERIALIZABLE);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test setTimeout with empty string
     */
    it('should handle setTimeout with empty string', async () => {
      const result = await transactionManager.setTimeout('', 5000);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TRANSACTION_NOT_FOUND');
    });

    /**
     * Test getTimeout with empty string
     */
    it('should handle getTimeout with empty string', () => {
      const timeout = transactionManager.getTimeout('');
      expect(timeout).toBeUndefined();
    });
  });

  describe('Transaction Lists', () => {
    /**
     * Test getActiveTransactions returns empty array when no active transactions
     */
    it('should return empty array when no active transactions', () => {
      const active = transactionManager.getActiveTransactions();
      expect(active).toEqual([]);
    });

    /**
     * Test getCommittedTransactions returns empty array when no committed transactions
     */
    it('should return empty array when no committed transactions', () => {
      const committed = transactionManager.getCommittedTransactions();
      expect(committed).toEqual([]);
    });

    /**
     * Test getRolledBackTransactions returns empty array when no rolled back transactions
     */
    it('should return empty array when no rolled back transactions', () => {
      const rolledBack = transactionManager.getRolledBackTransactions();
      expect(rolledBack).toEqual([]);
    });

    /**
     * Test getActiveTransactions does not include committed transactions
     */
    it('should not include committed transactions in active list', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const active = transactionManager.getActiveTransactions();
      expect(active).not.toContainEqual(
        expect.objectContaining({ transactionId: txn.transactionId })
      );
    });

    /**
     * Test getActiveTransactions does not include rolled back transactions
     */
    it('should not include rolled back transactions in active list', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.rollback(txn.transactionId);

      const active = transactionManager.getActiveTransactions();
      expect(active).not.toContainEqual(
        expect.objectContaining({ transactionId: txn.transactionId })
      );
    });

    /**
     * Test getCommittedTransactions does not include active transactions
     */
    it('should not include active transactions in committed list', async () => {
      const txn = await transactionManager.begin();

      const committed = transactionManager.getCommittedTransactions();
      expect(committed).not.toContain(txn.transactionId);
    });

    /**
     * Test getCommittedTransactions does not include rolled back transactions
     */
    it('should not include rolled back transactions in committed list', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.rollback(txn.transactionId);

      const committed = transactionManager.getCommittedTransactions();
      expect(committed).not.toContain(txn.transactionId);
    });

    /**
     * Test getRolledBackTransactions does not include active transactions
     */
    it('should not include active transactions in rolled back list', async () => {
      const txn = await transactionManager.begin();

      const rolledBack = transactionManager.getRolledBackTransactions();
      expect(rolledBack).not.toContain(txn.transactionId);
    });

    /**
     * Test getRolledBackTransactions does not include committed transactions
     */
    it('should not include committed transactions in rolled back list', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const rolledBack = transactionManager.getRolledBackTransactions();
      expect(rolledBack).not.toContain(txn.transactionId);
    });
  });

  describe('Transaction Duration Tracking', () => {
    /**
     * Test transaction duration is tracked on commit
     */
    it('should track duration on commit', async () => {
      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transactionManager.commit(txn.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    /**
     * Test transaction duration is tracked on rollback
     */
    it('should track duration on rollback', async () => {
      const txn = await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transactionManager.rollback(txn.transactionId);

      const stats = transactionManager.getStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    /**
     * Test duration is not tracked for failed transactions
     */
    it('should not track duration for failed transactions', async () => {
      const config = { timeout: 50 };
      transactionManager.setConfig(config);

      await transactionManager.begin();
      await new Promise((resolve) => setTimeout(resolve, 60));
      transactionManager.cleanupExpiredTransactions();

      const stats = transactionManager.getStats();
      expect(stats.averageDuration).toBe(0);
    });
  });

  describe('Transaction Manager with Custom Config', () => {
    /**
     * Test TransactionManager with custom initial config
     */
    it('should initialize with custom config', () => {
      const customManager = new TransactionManager({
        isolationLevel: IsolationLevel.SERIALIZABLE,
        timeout: 60000,
        readOnly: true,
        autoCommit: true,
      });

      const config = customManager.getConfig();
      expect(config.isolationLevel).toBe(IsolationLevel.SERIALIZABLE);
      expect(config.timeout).toBe(60000);
      expect(config.readOnly).toBe(true);
      expect(config.autoCommit).toBe(true);
    });

    /**
     * Test TransactionManager with partial custom config
     */
    it('should initialize with partial custom config', () => {
      const customManager = new TransactionManager({
        isolationLevel: IsolationLevel.REPEATABLE_READ,
      });

      const config = customManager.getConfig();
      expect(config.isolationLevel).toBe(IsolationLevel.REPEATABLE_READ);
      expect(config.timeout).toBe(30000);
      expect(config.readOnly).toBe(false);
      expect(config.autoCommit).toBe(false);
    });

    /**
     * Test TransactionManager with empty custom config
     */
    it('should initialize with default config when empty custom config provided', () => {
      const customManager = new TransactionManager({});

      const config = customManager.getConfig();
      expect(config.isolationLevel).toBe(IsolationLevel.READ_COMMITTED);
      expect(config.timeout).toBe(30000);
      expect(config.readOnly).toBe(false);
      expect(config.autoCommit).toBe(false);
    });
  });

  describe('Snapshot Data Operations', () => {
    /**
     * Test snapshot data can store multiple entries
     */
    it('should store multiple entries in snapshot data', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key1', 'value1');
      context?.snapshot.data.set('key2', 'value2');
      context?.snapshot.data.set('key3', 'value3');

      expect(context?.snapshot.data.size).toBe(3);
    });

    /**
     * Test snapshot data can delete entries
     */
    it('should delete entries from snapshot data', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key1', 'value1');
      context?.snapshot.data.delete('key1');

      expect(context?.snapshot.data.has('key1')).toBe(false);
    });

    /**
     * Test snapshot data can clear all entries
     */
    it('should clear all entries from snapshot data', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key1', 'value1');
      context?.snapshot.data.set('key2', 'value2');
      context?.snapshot.data.clear();

      expect(context?.snapshot.data.size).toBe(0);
    });

    /**
     * Test snapshot data can iterate over entries
     */
    it('should iterate over snapshot data entries', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.data.set('key1', 'value1');
      context?.snapshot.data.set('key2', 'value2');

      const entries = Array.from(context?.snapshot.data.entries() || []);
      expect(entries.length).toBe(2);
    });
  });

  describe('Snapshot Metadata Operations', () => {
    /**
     * Test snapshot metadata can store multiple entries
     */
    it('should store multiple entries in snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.metadata.set('meta1', 'value1');
      context?.snapshot.metadata.set('meta2', 'value2');
      context?.snapshot.metadata.set('meta3', 'value3');

      expect(context?.snapshot.metadata.size).toBe(3);
    });

    /**
     * Test snapshot metadata can delete entries
     */
    it('should delete entries from snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.metadata.set('meta1', 'value1');
      context?.snapshot.metadata.delete('meta1');

      expect(context?.snapshot.metadata.has('meta1')).toBe(false);
    });

    /**
     * Test snapshot metadata can clear all entries
     */
    it('should clear all entries from snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.metadata.set('meta1', 'value1');
      context?.snapshot.metadata.set('meta2', 'value2');
      context?.snapshot.metadata.clear();

      expect(context?.snapshot.metadata.size).toBe(0);
    });

    /**
     * Test snapshot metadata can iterate over entries
     */
    it('should iterate over snapshot metadata entries', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      context?.snapshot.metadata.set('meta1', 'value1');
      context?.snapshot.metadata.set('meta2', 'value2');

      const entries = Array.from(context?.snapshot.metadata.entries() || []);
      expect(entries.length).toBe(2);
    });
  });

  describe('Large Transaction Operations', () => {
    /**
     * Test transaction with many operations
     */
    it('should handle transaction with many operations', async () => {
      const txn = await transactionManager.begin();

      for (let i = 0; i < 1000; i++) {
        transactionManager.addOperation(txn.transactionId, {
          type: TransactionOperationType.WRITE,
          timestamp: new Date(),
          data: { index: i },
        });
      }

      const context = transactionManager.getTransaction(txn.transactionId);
      expect(context?.operations.length).toBe(1000);
    });

    /**
     * Test transaction with large snapshot data
     */
    it('should handle transaction with large snapshot data', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      for (let i = 0; i < 1000; i++) {
        context?.snapshot.data.set(`key-${i}`, `value-${i}`);
      }

      expect(context?.snapshot.data.size).toBe(1000);
    });

    /**
     * Test transaction with large snapshot metadata
     */
    it('should handle transaction with large snapshot metadata', async () => {
      const txn = await transactionManager.begin();
      const context = transactionManager.getTransaction(txn.transactionId);

      for (let i = 0; i < 1000; i++) {
        context?.snapshot.metadata.set(`meta-${i}`, `value-${i}`);
      }

      expect(context?.snapshot.metadata.size).toBe(1000);
    });
  });

  describe('Transaction State Consistency', () => {
    /**
     * Test state consistency across all methods
     */
    it('should maintain state consistency across methods', async () => {
      const txn = await transactionManager.begin();

      const context = transactionManager.getTransaction(txn.transactionId);
      const state = transactionManager.getTransactionState(txn.transactionId);
      const isActive = transactionManager.isActive(txn.transactionId);

      expect(context?.state).toBe(TransactionState.ACTIVE);
      expect(state).toBe(TransactionState.ACTIVE);
      expect(isActive).toBe(true);
    });

    /**
     * Test state consistency after commit
     */
    it('should maintain state consistency after commit', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.commit(txn.transactionId);

      const context = transactionManager.getTransaction(txn.transactionId);
      const state = transactionManager.getTransactionState(txn.transactionId);
      const isActive = transactionManager.isActive(txn.transactionId);

      expect(context?.state).toBe(TransactionState.COMMITTED);
      expect(state).toBe(TransactionState.COMMITTED);
      expect(isActive).toBe(false);
    });

    /**
     * Test state consistency after rollback
     */
    it('should maintain state consistency after rollback', async () => {
      const txn = await transactionManager.begin();
      await transactionManager.rollback(txn.transactionId);

      const context = transactionManager.getTransaction(txn.transactionId);
      const state = transactionManager.getTransactionState(txn.transactionId);
      const isActive = transactionManager.isActive(txn.transactionId);

      expect(context?.state).toBe(TransactionState.ROLLED_BACK);
      expect(state).toBe(TransactionState.ROLLED_BACK);
      expect(isActive).toBe(false);
    });
  });
});
