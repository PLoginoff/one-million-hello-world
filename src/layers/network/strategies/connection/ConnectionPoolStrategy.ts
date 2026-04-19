/**
 * Connection Pool Strategy
 * 
 * Manages connection pooling for efficient resource utilization.
 */

import { ConnectionMetadata } from '../../domain/entities/ConnectionMetadata';

export interface PoolStrategyConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxLifetime: number;
  validationInterval: number;
}

export class ConnectionPoolStrategy {
  private config: PoolStrategyConfig;
  private availableConnections: string[];
  private activeConnections: Map<string, number>;
  private connectionMetadata: Map<string, ConnectionMetadata>;

  constructor(config: Partial<PoolStrategyConfig> = {}) {
    this.config = {
      minConnections: config.minConnections ?? 1,
      maxConnections: config.maxConnections ?? 10,
      acquireTimeout: config.acquireTimeout ?? 30000,
      idleTimeout: config.idleTimeout ?? 60000,
      maxLifetime: config.maxLifetime ?? 3600000,
      validationInterval: config.validationInterval ?? 30000,
    };
    this.availableConnections = [];
    this.activeConnections = new Map();
    this.connectionMetadata = new Map();
  }

  /**
   * Acquire connection from pool
   */
  acquire(connectionId: string): boolean {
    if (this.availableConnections.includes(connectionId)) {
      const index = this.availableConnections.indexOf(connectionId);
      this.availableConnections.splice(index, 1);
      this.activeConnections.set(connectionId, Date.now());
      return true;
    }
    return false;
  }

  /**
   * Release connection back to pool
   */
  release(connectionId: string): void {
    if (this.activeConnections.has(connectionId)) {
      this.activeConnections.delete(connectionId);
      this.availableConnections.push(connectionId);
      const metadata = this.connectionMetadata.get(connectionId);
      if (metadata) {
        metadata.recordActivity();
      }
    }
  }

  /**
   * Add connection to pool
   */
  addConnection(connectionId: string, metadata?: ConnectionMetadata): boolean {
    if (this.availableConnections.length + this.activeConnections.size >= this.config.maxConnections) {
      return false;
    }
    this.availableConnections.push(connectionId);
    if (metadata) {
      this.connectionMetadata.set(connectionId, metadata);
    }
    return true;
  }

  /**
   * Remove connection from pool
   */
  removeConnection(connectionId: string): boolean {
    const availableIndex = this.availableConnections.indexOf(connectionId);
    if (availableIndex !== -1) {
      this.availableConnections.splice(availableIndex, 1);
    }
    const wasActive = this.activeConnections.delete(connectionId);
    this.connectionMetadata.delete(connectionId);
    return availableIndex !== -1 || wasActive;
  }

  /**
   * Get available connection count
   */
  getAvailableCount(): number {
    return this.availableConnections.length;
  }

  /**
   * Get active connection count
   */
  getActiveCount(): number {
    return this.activeConnections.size;
  }

  /**
   * Get total connection count
   */
  getTotalCount(): number {
    return this.availableConnections.length + this.activeConnections.size;
  }

  /**
   * Check if pool is at capacity
   */
  isAtCapacity(): boolean {
    return this.getTotalCount() >= this.config.maxConnections;
  }

  /**
   * Check if pool needs more connections
   */
  needsMoreConnections(): boolean {
    return this.getTotalCount() < this.config.minConnections;
  }

  /**
   * Clean up idle connections
   */
  cleanupIdleConnections(): number {
    let cleaned = 0;

    for (const connectionId of this.availableConnections) {
      const metadata = this.connectionMetadata.get(connectionId);
      if (metadata && metadata.getIdleTime() > this.config.idleTimeout) {
        this.removeConnection(connectionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clean up expired connections
   */
  cleanupExpiredConnections(): number {
    let cleaned = 0;

    for (const [connectionId, metadata] of this.connectionMetadata) {
      if (metadata.getAge() > this.config.maxLifetime) {
        this.removeConnection(connectionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    available: number;
    active: number;
    total: number;
    capacity: number;
    utilization: number;
  } {
    const total = this.getTotalCount();
    return {
      available: this.availableConnections.length,
      active: this.activeConnections.size,
      total,
      capacity: this.config.maxConnections,
      utilization: total / this.config.maxConnections,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PoolStrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): PoolStrategyConfig {
    return { ...this.config };
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.availableConnections = [];
    this.activeConnections.clear();
    this.connectionMetadata.clear();
  }
}
