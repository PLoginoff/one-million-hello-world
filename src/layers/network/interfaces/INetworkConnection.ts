/**
 * Network Connection Interface
 * 
 * Defines the contract for managing a single network connection.
 * This interface abstracts the underlying TCP socket implementation.
 */

import {
  NetworkBuffer,
  ConnectionState,
  SocketConfig,
  ConnectionConfig,
  ConnectionMetadata,
  DataTransmissionOptions,
  HealthStatus,
} from '../types/network-types';

/**
 * Interface for managing network connections
 */
export interface INetworkConnection {
  /**
   * Opens the network connection with the given configuration
   * 
   * @param config - Socket configuration
   * @returns Promise that resolves when connection is established
   * @throws {NetworkConnectionError} If connection fails
   */
  connect(config: SocketConfig): Promise<void>;

  /**
   * Closes the network connection gracefully
   * 
   * @returns Promise that resolves when connection is closed
   */
  disconnect(): Promise<void>;

  /**
   * Sends data through the connection
   * 
   * @param data - Raw buffer data to send
   * @returns Promise that resolves when data is sent
   * @throws {NetworkSendError} If send operation fails
   */
  send(data: NetworkBuffer): Promise<void>;

  /**
   * Receives data from the connection
   * 
   * @returns Promise that resolves with received data buffer
   * @throws {NetworkReceiveError} If receive operation fails
   */
  receive(): Promise<NetworkBuffer>;

  /**
   * Gets the current state of the connection
   * 
   * @returns Current connection state
   */
  getState(): ConnectionState;

  /**
   * Gets the unique identifier for this connection
   * 
   * @returns Connection ID string
   */
  getId(): string;

  /**
   * Checks if the connection is currently active
   * 
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean;

  /**
   * Sets a timeout for operations on this connection
   * 
   * @param timeoutMs - Timeout in milliseconds
   */
  setTimeout(timeoutMs: number): void;

  /**
   * Gets the remote address of the connected peer
   * 
   * @returns Remote address string or null if not connected
   */
  getRemoteAddress(): string | null;

  /**
   * Gets the remote port of the connected peer
   * 
   * @returns Remote port number or null if not connected
   */
  getRemotePort(): number | null;

  /**
   * Pauses the connection temporarily
   * 
   * @returns Promise that resolves when connection is paused
   */
  pause(): Promise<void>;

  /**
   * Resumes a paused connection
   * 
   * @returns Promise that resolves when connection is resumed
   */
  resume(): Promise<void>;

  /**
   * Reconnects to the remote endpoint
   * 
   * @param config - Optional new configuration
   * @returns Promise that resolves when reconnection is complete
   */
  reconnect(config?: SocketConfig): Promise<void>;

  /**
   * Sends data with transmission options
   * 
   * @param data - Raw buffer data to send
   * @param options - Transmission options
   * @returns Promise that resolves when data is sent
   */
  sendWithOptions(data: NetworkBuffer, options: DataTransmissionOptions): Promise<void>;

  /**
   * Gets connection metadata
   * 
   * @returns Connection metadata
   */
  getMetadata(): ConnectionMetadata;

  /**
   * Updates connection metadata
   * 
   * @param metadata - New metadata to merge
   */
  updateMetadata(metadata: Partial<ConnectionMetadata>): void;

  /**
   * Gets connection health status
   * 
   * @returns Health status
   */
  getHealthStatus(): HealthStatus;

  /**
   * Gets the number of bytes sent through this connection
   * 
   * @returns Number of bytes sent
   */
  getBytesSent(): number;

  /**
   * Gets the number of bytes received through this connection
   * 
   * @returns Number of bytes received
   */
  getBytesReceived(): number;

  /**
   * Gets the connection latency in milliseconds
   * 
   * @returns Latency in milliseconds
   */
  getLatency(): number;

  /**
   * Gets the connection uptime in milliseconds
   * 
   * @returns Uptime in milliseconds
   */
  getUptime(): number;

  /**
   * Sets connection priority
   * 
   * @param priority - Connection priority
   */
  setPriority(priority: number): void;

  /**
   * Gets connection priority
   * 
   * @returns Connection priority
   */
  getPriority(): number;

  /**
   * Enables compression for this connection
   * 
   * @param level - Compression level (0-9)
   */
  enableCompression(level: number): void;

  /**
   * Disables compression for this connection
   */
  disableCompression(): void;

  /**
   * Checks if compression is enabled
   * 
   * @returns True if compression is enabled
   */
  isCompressionEnabled(): boolean;

  /**
   * Enables encryption for this connection
   * 
   * @param key - Encryption key
   */
  enableEncryption(key: string): void;

  /**
   * Disables encryption for this connection
   */
  disableEncryption(): void;

  /**
   * Checks if encryption is enabled
   * 
   * @returns True if encryption is enabled
   */
  isEncryptionEnabled(): boolean;

  /**
   * Gets the last error that occurred on this connection
   * 
   * @returns Last error or null
   */
  getLastError(): Error | null;

  /**
   * Gets the number of errors that occurred on this connection
   * 
   * @returns Number of errors
   */
  getErrorCount(): number;

  /**
   * Resets error counter
   */
  resetErrorCount(): void;

  /**
   * Gets the number of reconnection attempts
   * 
   * @returns Number of reconnection attempts
   */
  getReconnectionAttempts(): number;

  /**
   * Gets the local address of this connection
   * 
   * @returns Local address string or null
   */
  getLocalAddress(): string | null;

  /**
   * Gets the local port of this connection
   * 
   * @returns Local port number or null
   */
  getLocalPort(): number | null;

  /**
   * Checks if the connection is writable
   * 
   * @returns True if writable
   */
  isWritable(): boolean;

  /**
   * Checks if the connection is readable
   * 
   * @returns True if readable
   */
  isReadable(): boolean;

  /**
   * Sets the connection to destroy after all data is sent
   */
  destroySoon(): void;

  /**
   * Immediately destroys the connection
   */
  destroy(): void;

  /**
   * Gets the connection configuration
   * 
   * @returns Connection configuration
   */
  getConfig(): ConnectionConfig;

  /**
   * Updates the connection configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<ConnectionConfig>): void;

  /**
   * Gets the buffer size for sending
   * 
   * @returns Buffer size in bytes
   */
  getSendBufferSize(): number;

  /**
   * Gets the buffer size for receiving
   * 
   * @returns Buffer size in bytes
   */
  getReceiveBufferSize(): number;

  /**
   * Sets the buffer size for sending
   * 
   * @param size - Buffer size in bytes
   */
  setSendBufferSize(size: number): void;

  /**
   * Sets the buffer size for receiving
   * 
   * @param size - Buffer size in bytes
   */
  setReceiveBufferSize(size: number): void;

  /**
   * Gets the number of bytes buffered for sending
   * 
   * @returns Number of bytes
   */
  getBufferedAmount(): number;

  /**
   * Flushes the send buffer
   * 
   * @returns Promise that resolves when buffer is flushed
   */
  flush(): Promise<void>;
}
