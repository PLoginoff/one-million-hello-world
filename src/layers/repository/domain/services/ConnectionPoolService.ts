/**
 * Connection Pool Service
 * 
 * Provides connection pool management for repositories.
 */

export interface Connection {
  id: string;
  active: boolean;
  lastUsed: number;
}

export class ConnectionPoolService {
  private connections: Map<string, Connection>;
  private readonly maxConnections: number;

  constructor(maxConnections: number = 10) {
    this.connections = new Map();
    this.maxConnections = maxConnections;
  }

  /**
   * Create connection
   */
  createConnection(id: string): Connection | null {
    if (this.connections.size >= this.maxConnections) {
      return null;
    }

    const connection: Connection = {
      id,
      active: true,
      lastUsed: Date.now(),
    };
    this.connections.set(id, connection);
    return connection;
  }

  /**
   * Release connection
   */
  releaseConnection(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.active = false;
    }
  }

  /**
   * Remove connection
   */
  removeConnection(id: string): void {
    this.connections.delete(id);
  }

  /**
   * Get connection
   */
  getConnection(id: string): Connection | undefined {
    const connection = this.connections.get(id);
    if (connection && connection.active) {
      connection.lastUsed = Date.now();
      return connection;
    }
    return undefined;
  }

  /**
   * Get active connection count
   */
  getActiveCount(): number {
    return Array.from(this.connections.values()).filter(c => c.active).length;
  }

  /**
   * Clear all connections
   */
  clearConnections(): void {
    this.connections.clear();
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }
}
