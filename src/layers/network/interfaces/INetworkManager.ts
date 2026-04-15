/**
 * Network Manager Interface
 * 
 * Defines the contract for managing multiple network connections
 * and providing high-level network operations.
 */

import { INetworkConnection } from './INetworkConnection';
import {
  NetworkStats,
  SocketConfig,
  AnyNetworkEvent,
  INetworkEventHandler,
  ConnectionConfig,
  ConnectionRequest,
  ConnectionResponse,
  ConnectionPoolConfig,
  SecurityConfig,
  BandwidthConfig,
  MonitoringConfig,
  PerformanceMetrics,
  HealthStatus,
  NetworkDiagnostics,
  EventSubscription,
  EventFilter,
  ConnectionState,
} from '../types/network-types';

/**
 * Interface for managing network connections and operations
 */
export interface INetworkManager {
  /**
   * Creates a new network connection
   * 
   * @param config - Socket configuration
   * @returns Promise that resolves with the created connection
   * @throws {NetworkManagerError} If connection creation fails
   */
  createConnection(config: SocketConfig): Promise<INetworkConnection>;

  /**
   * Gets an existing connection by its ID
   * 
   * @param connectionId - Unique connection identifier
   * @returns Connection instance or null if not found
   */
  getConnection(connectionId: string): INetworkConnection | null;

  /**
   * Closes and removes a connection
   * 
   * @param connectionId - Unique connection identifier
   * @returns Promise that resolves when connection is closed
   */
  closeConnection(connectionId: string): Promise<void>;

  /**
   * Closes all active connections
   * 
   * @returns Promise that resolves when all connections are closed
   */
  closeAllConnections(): Promise<void>;

  /**
   * Gets statistics about network operations
   * 
   * @returns Current network statistics
   */
  getStats(): NetworkStats;

  /**
   * Resets network statistics
   */
  resetStats(): void;

  /**
   * Registers an event handler for network events
   * 
   * @param handler - Event handler implementation
   */
  registerEventHandler(handler: INetworkEventHandler): void;

  /**
   * Unregisters an event handler
   * 
   * @param handler - Event handler to remove
   */
  unregisterEventHandler(handler: INetworkEventHandler): void;

  /**
   * Gets the count of active connections
   * 
   * @returns Number of active connections
   */
  getActiveConnectionCount(): number;

  /**
   * Checks if a connection with given ID exists
   * 
   * @param connectionId - Unique connection identifier
   * @returns True if connection exists, false otherwise
   */
  hasConnection(connectionId: string): boolean;

  /**
   * Gets all active connection IDs
   * 
   * @returns Array of active connection IDs
   */
  getAllConnectionIds(): string[];

  /**
   * Creates a connection with advanced configuration
   * 
   * @param request - Connection request with configuration
   * @returns Promise that resolves with connection response
   */
  createConnectionAdvanced(request: ConnectionRequest): Promise<ConnectionResponse>;

  /**
   * Gets connections by priority
   * 
   * @param priority - Connection priority
   * @returns Array of connections with given priority
   */
  getConnectionsByPriority(priority: number): INetworkConnection[];

  /**
   * Gets connections by state
   * 
   * @param state - Connection state
   * @returns Array of connections in given state
   */
  getConnectionsByState(state: string): INetworkConnection[];

  /**
   * Pauses all connections
   * 
   * @returns Promise that resolves when all connections are paused
   */
  pauseAllConnections(): Promise<void>;

  /**
   * Resumes all paused connections
   * 
   * @returns Promise that resolves when all connections are resumed
   */
  resumeAllConnections(): Promise<void>;

  /**
   * Reconnects all failed connections
   * 
   * @returns Promise that resolves when reconnection attempts complete
   */
  reconnectFailedConnections(): Promise<void>;

  /**
   * Gets connection pool configuration
   * 
   * @returns Connection pool configuration
   */
  getPoolConfig(): ConnectionPoolConfig;

  /**
   * Sets connection pool configuration
   * 
   * @param config - Connection pool configuration
   */
  setPoolConfig(config: ConnectionPoolConfig): void;

  /**
   * Gets security configuration
   * 
   * @returns Security configuration
   */
  getSecurityConfig(): SecurityConfig;

  /**
   * Sets security configuration
   * 
   * @param config - Security configuration
   */
  setSecurityConfig(config: SecurityConfig): void;

  /**
   * Gets bandwidth configuration
   * 
   * @returns Bandwidth configuration
   */
  getBandwidthConfig(): BandwidthConfig;

  /**
   * Sets bandwidth configuration
   * 
   * @param config - Bandwidth configuration
   */
  setBandwidthConfig(config: BandwidthConfig): void;

  /**
   * Gets monitoring configuration
   * 
   * @returns Monitoring configuration
   */
  getMonitoringConfig(): MonitoringConfig;

  /**
   * Sets monitoring configuration
   * 
   * @param config - Monitoring configuration
   */
  setMonitoringConfig(config: MonitoringConfig): void;

  /**
   * Gets current performance metrics
   * 
   * @returns Performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics;

  /**
   * Gets overall health status
   * 
   * @returns Health status
   */
  getHealthStatus(): HealthStatus;

  /**
   * Runs network diagnostics
   * 
   * @returns Promise that resolves with diagnostic results
   */
  runDiagnostics(): Promise<NetworkDiagnostics>;

  /**
   * Subscribes to events with filter
   * 
   * @param subscription - Event subscription configuration
   * @returns Subscription ID
   */
  subscribeToEvents(subscription: EventSubscription): string;

  /**
   * Unsubscribes from events
   * 
   * @param subscriptionId - Subscription ID
   */
  unsubscribeFromEvents(subscriptionId: string): void;

  /**
   * Gets all event subscriptions
   * 
   * @returns Map of subscription IDs to subscriptions
   */
  getEventSubscriptions(): Map<string, EventSubscription>;

  /**
   * Broadcasts event to all handlers
   * 
   * @param event - Network event to broadcast
   * @returns Promise that resolves when broadcast is complete
   */
  broadcastEvent(event: AnyNetworkEvent): Promise<void>;

  /**
   * Gets connection statistics by ID
   * 
   * @param connectionId - Connection ID
   * @returns Connection statistics or null
   */
  getConnectionStats(connectionId: string): NetworkStats | null;

  /**
   * Gets all connection statistics
   * 
   * @returns Map of connection IDs to statistics
   */
  getAllConnectionStats(): Map<string, NetworkStats>;

  /**
   * Sets maximum concurrent connections
   * 
   * @param max - Maximum number of concurrent connections
   */
  setMaxConnections(max: number): void;

  /**
   * Gets maximum concurrent connections
   * 
   * @returns Maximum number of concurrent connections
   */
  getMaxConnections(): number;

  /**
   * Gets queued connection count
   * 
   * @returns Number of queued connections
   */
  getQueuedConnectionCount(): number;

  /**
   * Acquires connection from pool
   * 
   * @param config - Connection configuration
   * @param timeout - Acquisition timeout in milliseconds
   * @returns Promise that resolves with connection or null if timeout
   */
  acquireConnection(config: ConnectionConfig, timeout?: number): Promise<INetworkConnection | null>;

  /**
   * Releases connection back to pool
   * 
   * @param connectionId - Connection ID
   */
  releaseConnection(connectionId: string): void;

  /**
   * Gets pool statistics
   * 
   * @returns Pool statistics
   */
  getPoolStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    queuedRequests: number;
  };

  /**
   * Cleans up idle connections
   * 
   * @param maxIdleTime - Maximum idle time in milliseconds
   * @returns Number of connections cleaned up
   */
  cleanupIdleConnections(maxIdleTime: number): number;

  /**
   * Gets connection history
   * 
   * @param limit - Maximum number of history entries
   * @returns Connection history
   */
  getConnectionHistory(limit?: number): ConnectionHistoryEntry[];

  /**
   * Exports network state
   * 
   * @returns Network state snapshot
   */
  exportState(): NetworkState;

  /**
   * Imports network state
   * 
   * @param state - Network state to import
   */
  importState(state: NetworkState): void;

  /**
   * Gets uptime in milliseconds
   * 
   * @returns Uptime in milliseconds
   */
  getUptime(): number;

  /**
   * Restarts network manager
   * 
   * @returns Promise that resolves when restart is complete
   */
  restart(): Promise<void>;

  /**
   * Shuts down network manager gracefully
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void>;
}

/**
 * Connection history entry
 */
export interface ConnectionHistoryEntry {
  connectionId: string;
  timestamp: Date;
  action: 'created' | 'closed' | 'reconnected' | 'error';
  details?: Record<string, unknown>;
}

/**
 * Network state snapshot
 */
export interface NetworkState {
  connections: Map<string, ConnectionState>;
  stats: NetworkStats;
  poolConfig: ConnectionPoolConfig;
  securityConfig: SecurityConfig;
  bandwidthConfig: BandwidthConfig;
  monitoringConfig: MonitoringConfig;
  timestamp: Date;
}
