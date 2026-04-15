/**
 * Network Layer Types
 * 
 * This module defines all type definitions for the Network Layer,
 * including socket configurations, connection states, network events,
 * security settings, performance metrics, and advanced features.
 */

/**
 * Represents the state of a network connection
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  CLOSING = 'CLOSING',
  ERROR = 'ERROR',
  RECONNECTING = 'RECONNECTING',
  PAUSED = 'PAUSED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Connection priority for resource allocation
 */
export enum ConnectionPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Connection type classification
 */
export enum ConnectionType {
  TCP = 'TCP',
  UDP = 'UDP',
  TLS = 'TLS',
  WEBSOCKET = 'WEBSOCKET',
}

/**
 * Configuration for TCP socket
 */
export interface SocketConfig {
  host: string;
  port: number;
  timeout?: number;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  noDelay?: boolean;
  allowHalfOpen?: boolean;
  pauseOnClose?: boolean;
}

/**
 * Advanced connection configuration
 */
export interface ConnectionConfig {
  socket: SocketConfig;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  priority?: ConnectionPriority;
  type?: ConnectionType;
  enableCompression?: boolean;
  compressionLevel?: number;
  enableEncryption?: boolean;
  encryptionKey?: string;
}

/**
 * TLS/SSL configuration
 */
export interface TLSConfig {
  cert?: string;
  key?: string;
  ca?: string;
  rejectUnauthorized?: boolean;
  minVersion?: string;
  maxVersion?: string;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxLifetime: number;
}

/**
 * Security settings
 */
export interface SecurityConfig {
  enableIPWhitelist: boolean;
  ipWhitelist: string[];
  enableIPBlacklist: boolean;
  ipBlacklist: string[];
  enableRateLimit: boolean;
  rateLimitMax: number;
  rateLimitWindow: number;
  enableTLS: boolean;
  tlsConfig?: TLSConfig;
}

/**
 * Statistics about network operations
 */
export interface NetworkStats {
  bytesReceived: number;
  bytesSent: number;
  connectionsOpened: number;
  connectionsClosed: number;
  errors: number;
  lastError?: Error;
  uptime: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  throughput: number;
  packetLoss: number;
  reconnections: number;
  activeConnections: number;
  queuedConnections: number;
}

/**
 * Performance metrics for monitoring
 */
export interface PerformanceMetrics {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  ioWait: number;
  threadCount: number;
  eventLoopDelay: number;
}

/**
 * Connection health status
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: HealthCheck[];
  lastCheck: Date;
}

/**
 * Individual health check result
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
}

/**
 * Connection metadata
 */
export interface ConnectionMetadata {
  createdAt: Date;
  lastActiveAt: Date;
  totalBytesSent: number;
  totalBytesReceived: number;
  requestCount: number;
  errorCount: number;
  userContext?: Record<string, unknown>;
}

/**
 * Raw network data buffer
 */
export type NetworkBuffer = Buffer;

/**
 * Network event types
 */
export enum NetworkEventType {
  CONNECTION_OPENED = 'CONNECTION_OPENED',
  CONNECTION_CLOSED = 'CONNECTION_CLOSED',
  DATA_RECEIVED = 'DATA_RECEIVED',
  DATA_SENT = 'DATA_SENT',
  ERROR = 'ERROR',
}

/**
 * Base network event
 */
export interface NetworkEvent {
  type: NetworkEventType;
  timestamp: Date;
  connectionId: string;
}

/**
 * Connection opened event
 */
export interface ConnectionOpenedEvent extends NetworkEvent {
  type: NetworkEventType.CONNECTION_OPENED;
  remoteAddress: string;
  remotePort: number;
}

/**
 * Connection closed event
 */
export interface ConnectionClosedEvent extends NetworkEvent {
  type: NetworkEventType.CONNECTION_CLOSED;
  reason?: string;
}

/**
 * Data received event
 */
export interface DataReceivedEvent extends NetworkEvent {
  type: NetworkEventType.DATA_RECEIVED;
  data: NetworkBuffer;
  size: number;
}

/**
 * Data sent event
 */
export interface DataSentEvent extends NetworkEvent {
  type: NetworkEventType.DATA_SENT;
  data: NetworkBuffer;
  size: number;
}

/**
 * Network error event
 */
export interface NetworkErrorEvent extends NetworkEvent {
  type: NetworkEventType.ERROR;
  error: Error;
}

/**
 * Union type for all network events
 */
export type AnyNetworkEvent =
  | ConnectionOpenedEvent
  | ConnectionClosedEvent
  | DataReceivedEvent
  | DataSentEvent
  | NetworkErrorEvent;

/**
 * Network layer interface for event handlers
 */
export interface INetworkEventHandler {
  handle(event: AnyNetworkEvent): Promise<void>;
}

/**
 * Event filter for selective event handling
 */
export interface EventFilter {
  eventType?: NetworkEventType;
  connectionId?: string;
  minSeverity?: 'low' | 'medium' | 'high';
  customFilter?: (event: AnyNetworkEvent) => boolean;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription {
  handler: INetworkEventHandler;
  filter?: EventFilter;
  once?: boolean;
  priority?: number;
}

/**
 * Connection request
 */
export interface ConnectionRequest {
  config: ConnectionConfig;
  metadata?: ConnectionMetadata;
  timeout?: number;
}

/**
 * Connection response
 */
export interface ConnectionResponse {
  success: boolean;
  connectionId?: string;
  error?: string;
  latency?: number;
}

/**
 * Data transmission options
 */
export interface DataTransmissionOptions {
  compress?: boolean;
  encrypt?: boolean;
  priority?: ConnectionPriority;
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Bandwidth throttling configuration
 */
export interface BandwidthConfig {
  enabled: boolean;
  maxBytesPerSecond: number;
  bucketSize: number;
  refillRate: number;
}

/**
 * Connection monitoring configuration
 */
export interface MonitoringConfig {
  enableHeartbeat: boolean;
  heartbeatInterval: number;
  enableLatencyTracking: boolean;
  enableThroughputTracking: boolean;
  enableErrorTracking: boolean;
  alertThresholds: AlertThresholds;
}

/**
 * Alert thresholds for monitoring
 */
export interface AlertThresholds {
  latencyMs: number;
  errorRate: number;
  connectionDropRate: number;
  memoryUsageMB: number;
}

/**
 * Network diagnostics data
 */
export interface NetworkDiagnostics {
  traceId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  steps: DiagnosticStep[];
  summary: DiagnosticSummary;
}

/**
 * Individual diagnostic step
 */
export interface DiagnosticStep {
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'success' | 'failure' | 'skipped';
  details?: Record<string, unknown>;
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  overallStatus: 'success' | 'failure' | 'partial';
}
