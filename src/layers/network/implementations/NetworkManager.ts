/**
 * Network Manager Implementation
 * 
 * Concrete implementation of INetworkManager.
 * Manages multiple network connections with statistics tracking.
 */

import { INetworkManager, ConnectionHistoryEntry, NetworkState } from '../interfaces/INetworkManager';
import { INetworkConnection } from '../interfaces/INetworkConnection';
import { NetworkConnection } from './NetworkConnection';
import {
  NetworkStats,
  SocketConfig,
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
  AnyNetworkEvent,
  ConnectionState,
  DiagnosticStep,
  DiagnosticSummary,
  HealthCheck,
} from '../types/network-types';
import { v4 as uuidv4 } from 'uuid';

export class NetworkManager implements INetworkManager {
  private _connections: Map<string, INetworkConnection>;
  private _stats: NetworkStats;
  private _eventHandlers: Set<INetworkEventHandler>;
  private _eventSubscriptions: Map<string, EventSubscription>;
  private _poolConfig: ConnectionPoolConfig;
  private _securityConfig: SecurityConfig;
  private _bandwidthConfig: BandwidthConfig;
  private _monitoringConfig: MonitoringConfig;
  private _connectionHistory: ConnectionHistoryEntry[];
  private _maxConnections: number;
  private _connectionQueue: ConnectionRequest[];
  private _startTime: Date;
  private _connectionStats: Map<string, NetworkStats>;

  constructor() {
    this._connections = new Map();
    this._stats = {
      bytesReceived: 0,
      bytesSent: 0,
      connectionsOpened: 0,
      connectionsClosed: 0,
      errors: 0,
      uptime: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      throughput: 0,
      packetLoss: 0,
      reconnections: 0,
      activeConnections: 0,
      queuedConnections: 0,
    };
    this._eventHandlers = new Set();
    this._eventSubscriptions = new Map();
    this._poolConfig = {
      minConnections: 1,
      maxConnections: 100,
      acquireTimeout: 30000,
      idleTimeout: 60000,
      maxLifetime: 3600000,
    };
    this._securityConfig = {
      enableIPWhitelist: false,
      ipWhitelist: [],
      enableIPBlacklist: false,
      ipBlacklist: [],
      enableRateLimit: false,
      rateLimitMax: 100,
      rateLimitWindow: 60000,
      enableTLS: false,
    };
    this._bandwidthConfig = {
      enabled: false,
      maxBytesPerSecond: 1024 * 1024,
      bucketSize: 1024 * 1024,
      refillRate: 1024 * 1024,
    };
    this._monitoringConfig = {
      enableHeartbeat: true,
      heartbeatInterval: 30000,
      enableLatencyTracking: true,
      enableThroughputTracking: true,
      enableErrorTracking: true,
      alertThresholds: {
        latencyMs: 1000,
        errorRate: 0.1,
        connectionDropRate: 0.05,
        memoryUsageMB: 512,
      },
    };
    this._connectionHistory = [];
    this._maxConnections = 100;
    this._connectionQueue = [];
    this._startTime = new Date();
    this._connectionStats = new Map();
  }

  async createConnection(config: SocketConfig): Promise<INetworkConnection> {
    const connection = new NetworkConnection();
    await connection.connect(config);

    this._connections.set(connection.getId(), connection);
    this._stats.connectionsOpened++;

    connection.getId();

    return connection;
  }

  getConnection(connectionId: string): INetworkConnection | null {
    return this._connections.get(connectionId) || null;
  }

  async closeConnection(connectionId: string): Promise<void> {
    const connection = this._connections.get(connectionId);

    if (connection) {
      await connection.disconnect();
      this._connections.delete(connectionId);
      this._stats.connectionsClosed++;
    }
  }

  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this._connections.values()).map((connection) =>
      connection.disconnect()
    );

    await Promise.all(closePromises);
    this._connections.clear();
    this._stats.connectionsClosed += this._connections.size;
  }

  getStats(): NetworkStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      bytesReceived: 0,
      bytesSent: 0,
      connectionsOpened: 0,
      connectionsClosed: 0,
      errors: 0,
      uptime: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      throughput: 0,
      packetLoss: 0,
      reconnections: 0,
      activeConnections: 0,
      queuedConnections: 0,
    };
  }

  registerEventHandler(handler: INetworkEventHandler): void {
    this._eventHandlers.add(handler);
  }

  unregisterEventHandler(handler: INetworkEventHandler): void {
    this._eventHandlers.delete(handler);
  }

  getActiveConnectionCount(): number {
    return this._connections.size;
  }

  hasConnection(connectionId: string): boolean {
    return this._connections.has(connectionId);
  }

  getAllConnectionIds(): string[] {
    return Array.from(this._connections.keys());
  }

  async createConnectionAdvanced(request: ConnectionRequest): Promise<ConnectionResponse> {
    const startTime = Date.now();
    try {
      const connection = new NetworkConnection();
      await connection.connect(request.config.socket);

      this._connections.set(connection.getId(), connection);
      this._stats.connectionsOpened++;
      this._stats.activeConnections = this._connections.size;

      this._addHistoryEntry({
        connectionId: connection.getId(),
        timestamp: new Date(),
        action: 'created',
        details: { config: request.config },
      });

      this._connectionStats.set(connection.getId(), {
        bytesReceived: 0,
        bytesSent: 0,
        connectionsOpened: 1,
        connectionsClosed: 0,
        errors: 0,
        uptime: 0,
        averageLatency: 0,
        minLatency: Infinity,
        maxLatency: 0,
        throughput: 0,
        packetLoss: 0,
        reconnections: 0,
        activeConnections: 1,
        queuedConnections: 0,
      });

      return {
        success: true,
        connectionId: connection.getId(),
        latency: Date.now() - startTime,
      };
    } catch (error) {
      this._stats.errors++;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  getConnectionsByPriority(priority: number): INetworkConnection[] {
    return Array.from(this._connections.values()).filter(
      (conn) => conn.getPriority() === priority
    );
  }

  getConnectionsByState(state: string): INetworkConnection[] {
    return Array.from(this._connections.values()).filter(
      (conn) => conn.getState() === state
    );
  }

  async pauseAllConnections(): Promise<void> {
    const pausePromises = Array.from(this._connections.values()).map((conn) =>
      conn.pause().catch(() => {})
    );
    await Promise.all(pausePromises);
  }

  async resumeAllConnections(): Promise<void> {
    const resumePromises = Array.from(this._connections.values()).map((conn) =>
      conn.resume().catch(() => {})
    );
    await Promise.all(resumePromises);
  }

  async reconnectFailedConnections(): Promise<void> {
    const failedConnections = this.getConnectionsByState('ERROR');
    const reconnectPromises = failedConnections.map((conn) =>
      conn.reconnect().catch(() => {})
    );
    await Promise.all(reconnectPromises);
  }

  getPoolConfig(): ConnectionPoolConfig {
    return { ...this._poolConfig };
  }

  setPoolConfig(config: ConnectionPoolConfig): void {
    this._poolConfig = { ...this._poolConfig, ...config };
  }

  getSecurityConfig(): SecurityConfig {
    return { ...this._securityConfig };
  }

  setSecurityConfig(config: SecurityConfig): void {
    this._securityConfig = { ...this._securityConfig, ...config };
  }

  getBandwidthConfig(): BandwidthConfig {
    return { ...this._bandwidthConfig };
  }

  setBandwidthConfig(config: BandwidthConfig): void {
    this._bandwidthConfig = { ...this._bandwidthConfig, ...config };
  }

  getMonitoringConfig(): MonitoringConfig {
    return { ...this._monitoringConfig };
  }

  setMonitoringConfig(config: MonitoringConfig): void {
    this._monitoringConfig = { ...this._monitoringConfig, ...config };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      timestamp: new Date(),
      cpuUsage: 0,
      memoryUsage: 0,
      networkLatency: this._stats.averageLatency,
      ioWait: 0,
      threadCount: 1,
      eventLoopDelay: 0,
    };
  }

  getHealthStatus(): HealthStatus {
    const checks: HealthCheck[] = [];

    const connectionCheck = this._performConnectionHealthCheck();
    checks.push(connectionCheck);

    const latencyCheck = this._performLatencyHealthCheck();
    checks.push(latencyCheck);

    const errorCheck = this._performErrorHealthCheck();
    checks.push(errorCheck);

    const score = this._calculateHealthScore(checks);
    const status = this._determineHealthStatus(score);

    return {
      status,
      score,
      checks,
      lastCheck: new Date(),
    };
  }

  async runDiagnostics(): Promise<NetworkDiagnostics> {
    const traceId = uuidv4();
    const startTime = new Date();
    const steps: DiagnosticStep[] = [];

    const connectionCheck = await this._performConnectionDiagnostics();
    steps.push(connectionCheck);

    const securityCheck = await this._performSecurityDiagnostics();
    steps.push(securityCheck);

    const performanceCheck = await this._performPerformanceDiagnostics();
    steps.push(performanceCheck);

    const endTime = new Date();
    const summary = this._calculateDiagnosticSummary(steps);

    return {
      traceId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      steps,
      summary,
    };
  }

  subscribeToEvents(subscription: EventSubscription): string {
    const subscriptionId = uuidv4();
    this._eventSubscriptions.set(subscriptionId, subscription);
    return subscriptionId;
  }

  unsubscribeFromEvents(subscriptionId: string): void {
    this._eventSubscriptions.delete(subscriptionId);
  }

  getEventSubscriptions(): Map<string, EventSubscription> {
    return new Map(this._eventSubscriptions);
  }

  async broadcastEvent(event: AnyNetworkEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const subscription of this._eventSubscriptions.values()) {
      if (this._shouldHandleEvent(event, subscription.filter)) {
        promises.push(subscription.handler.handle(event));
      }
    }

    for (const handler of this._eventHandlers) {
      promises.push(handler.handle(event));
    }

    await Promise.all(promises);
  }

  getConnectionStats(connectionId: string): NetworkStats | null {
    return this._connectionStats.get(connectionId) || null;
  }

  getAllConnectionStats(): Map<string, NetworkStats> {
    return new Map(this._connectionStats);
  }

  setMaxConnections(max: number): void {
    this._maxConnections = max;
  }

  getMaxConnections(): number {
    return this._maxConnections;
  }

  getQueuedConnectionCount(): number {
    return this._connectionQueue.length;
  }

  async acquireConnection(config: ConnectionConfig, timeout?: number): Promise<INetworkConnection | null> {
    if (this._connections.size >= this._maxConnections) {
      this._connectionQueue.push({ config });
      this._stats.queuedConnections = this._connectionQueue.length;
      return null;
    }

    const response = await this.createConnectionAdvanced({ config });
    if (response.success && response.connectionId) {
      return this.getConnection(response.connectionId);
    }
    return null;
  }

  releaseConnection(connectionId: string): void {
    this._connectionStats.delete(connectionId);
  }

  getPoolStats() {
    return {
      totalConnections: this._connections.size,
      activeConnections: this._connections.size,
      idleConnections: 0,
      queuedRequests: this._connectionQueue.length,
    };
  }

  cleanupIdleConnections(maxIdleTime: number): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [id, conn] of this._connections) {
      const uptime = conn.getUptime();
      if (now - uptime > maxIdleTime) {
        this.closeConnection(id).catch(() => {});
        cleaned++;
      }
    }

    return cleaned;
  }

  getConnectionHistory(limit?: number): ConnectionHistoryEntry[] {
    if (limit) {
      return this._connectionHistory.slice(-limit);
    }
    return [...this._connectionHistory];
  }

  exportState(): NetworkState {
    const connectionStates = new Map<string, ConnectionState>();
    for (const [id, conn] of this._connections) {
      connectionStates.set(id, conn.getState());
    }

    return {
      connections: connectionStates,
      stats: { ...this._stats },
      poolConfig: { ...this._poolConfig },
      securityConfig: { ...this._securityConfig },
      bandwidthConfig: { ...this._bandwidthConfig },
      monitoringConfig: { ...this._monitoringConfig },
      timestamp: new Date(),
    };
  }

  importState(state: NetworkState): void {
    this._stats = { ...state.stats };
    this._poolConfig = { ...state.poolConfig };
    this._securityConfig = { ...state.securityConfig };
    this._bandwidthConfig = { ...state.bandwidthConfig };
    this._monitoringConfig = { ...state.monitoringConfig };
  }

  getUptime(): number {
    return Date.now() - this._startTime.getTime();
  }

  async restart(): Promise<void> {
    await this.shutdown();
    this._startTime = new Date();
    this._connections.clear();
    this._connectionStats.clear();
    this.resetStats();
  }

  async shutdown(): Promise<void> {
    await this.closeAllConnections();
    this._eventHandlers.clear();
    this._eventSubscriptions.clear();
    this._connectionHistory = [];
    this._connectionQueue = [];
  }

  private _addHistoryEntry(entry: ConnectionHistoryEntry): void {
    this._connectionHistory.push(entry);
    if (this._connectionHistory.length > 1000) {
      this._connectionHistory.shift();
    }
  }

  private _shouldHandleEvent(event: AnyNetworkEvent, filter?: any): boolean {
    if (!filter) return true;
    if (filter.eventType && event.type !== filter.eventType) return false;
    if (filter.connectionId && event.connectionId !== filter.connectionId) return false;
    if (filter.customFilter && !filter.customFilter(event)) return false;
    return true;
  }

  private _performConnectionHealthCheck(): HealthCheck {
    const isActive = this._connections.size > 0;
    return {
      name: 'connections',
      status: isActive ? 'pass' : 'warn',
      message: `Active connections: ${this._connections.size}`,
      duration: 0,
    };
  }

  private _performLatencyHealthCheck(): HealthCheck {
    const isHealthy = this._stats.averageLatency < 1000;
    return {
      name: 'latency',
      status: isHealthy ? 'pass' : 'warn',
      message: `Average latency: ${this._stats.averageLatency}ms`,
      duration: 0,
    };
  }

  private _performErrorHealthCheck(): HealthCheck {
    const isHealthy = this._stats.errors === 0;
    return {
      name: 'errors',
      status: isHealthy ? 'pass' : this._stats.errors < 10 ? 'warn' : 'fail',
      message: `Error count: ${this._stats.errors}`,
      duration: 0,
    };
  }

  private _calculateHealthScore(checks: HealthCheck[]): number {
    let score = 100;
    checks.forEach((check) => {
      if (check.status === 'fail') {
        score -= 33;
      } else if (check.status === 'warn') {
        score -= 11;
      }
    });
    return Math.max(0, score);
  }

  private _determineHealthStatus(score: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (score >= 80) {
      return 'healthy';
    } else if (score >= 50) {
      return 'degraded';
    }
    return 'unhealthy';
  }

  private async _performConnectionDiagnostics(): Promise<DiagnosticStep> {
    const startTime = new Date();
    try {
      const connectionCount = this._connections.size;
      const endTime = new Date();
      return {
        name: 'connection_check',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status: 'success',
        details: { connectionCount },
      };
    } catch (error) {
      const endTime = new Date();
      return {
        name: 'connection_check',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status: 'failure',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private async _performSecurityDiagnostics(): Promise<DiagnosticStep> {
    const startTime = new Date();
    const endTime = new Date();
    return {
      name: 'security_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: {
        ipWhitelistEnabled: this._securityConfig.enableIPWhitelist,
        rateLimitEnabled: this._securityConfig.enableRateLimit,
        tlSEnabled: this._securityConfig.enableTLS,
      },
    };
  }

  private async _performPerformanceDiagnostics(): Promise<DiagnosticStep> {
    const startTime = new Date();
    const metrics = this.getPerformanceMetrics();
    const endTime = new Date();
    return {
      name: 'performance_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: { metrics },
    };
  }

  private _calculateDiagnosticSummary(steps: DiagnosticStep[]): DiagnosticSummary {
    const totalSteps = steps.length;
    const successfulSteps = steps.filter((s) => s.status === 'success').length;
    const failedSteps = steps.filter((s) => s.status === 'failure').length;
    const skippedSteps = steps.filter((s) => s.status === 'skipped').length;

    let overallStatus: 'success' | 'failure' | 'partial';
    if (failedSteps === 0) {
      overallStatus = 'success';
    } else if (successfulSteps > 0) {
      overallStatus = 'partial';
    } else {
      overallStatus = 'failure';
    }

    return {
      totalSteps,
      successfulSteps,
      failedSteps,
      skippedSteps,
      overallStatus,
    };
  }
}
