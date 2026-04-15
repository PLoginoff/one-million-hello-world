/**
 * Network Connection Implementation
 * 
 * Concrete implementation of INetworkConnection using Node.js net module.
 * Manages individual TCP socket connections with state tracking.
 */

import { INetworkConnection } from '../interfaces/INetworkConnection';
import {
  ConnectionState,
  SocketConfig,
  NetworkBuffer,
  ConnectionConfig,
  ConnectionMetadata,
  DataTransmissionOptions,
  HealthStatus,
  HealthCheck,
} from '../types/network-types';
import { v4 as uuidv4 } from 'uuid';

export class NetworkConnection implements INetworkConnection {
  private _id: string;
  private _state: ConnectionState;
  private _config: SocketConfig | null;
  private _connectionConfig: ConnectionConfig | null;
  private _socket: any;
  private _timeout: number;
  private _remoteAddress: string | null;
  private _remotePort: number | null;
  private _localAddress: string | null;
  private _localPort: number | null;
  private _metadata: ConnectionMetadata;
  private _bytesSent: number;
  private _bytesReceived: number;
  private _lastError: Error | null;
  private _errorCount: number;
  private _reconnectionAttempts: number;
  private _priority: number;
  private _compressionEnabled: boolean;
  private _compressionLevel: number;
  private _encryptionEnabled: boolean;
  private _encryptionKey: string | null;
  private _sendBufferSize: number;
  private _receiveBufferSize: number;
  private _createdAt: Date;
  private _lastActiveAt: Date;
  private _latency: number;
  private _minLatency: number;
  private _maxLatency: number;

  constructor() {
    this._id = uuidv4();
    this._state = ConnectionState.DISCONNECTED;
    this._config = null;
    this._connectionConfig = null;
    this._socket = null;
    this._timeout = 30000;
    this._remoteAddress = null;
    this._remotePort = null;
    this._localAddress = null;
    this._localPort = null;
    this._metadata = {
      createdAt: new Date(),
      lastActiveAt: new Date(),
      totalBytesSent: 0,
      totalBytesReceived: 0,
      requestCount: 0,
      errorCount: 0,
    };
    this._bytesSent = 0;
    this._bytesReceived = 0;
    this._lastError = null;
    this._errorCount = 0;
    this._reconnectionAttempts = 0;
    this._priority = 1;
    this._compressionEnabled = false;
    this._compressionLevel = 6;
    this._encryptionEnabled = false;
    this._encryptionKey = null;
    this._sendBufferSize = 65536;
    this._receiveBufferSize = 65536;
    this._createdAt = new Date();
    this._lastActiveAt = new Date();
    this._latency = 0;
    this._minLatency = Infinity;
    this._maxLatency = 0;
  }

  async connect(config: SocketConfig): Promise<void> {
    this._state = ConnectionState.CONNECTING;
    this._config = config;

    try {
      await this._createSocket(config);
      this._state = ConnectionState.CONNECTED;
    } catch (error) {
      this._state = ConnectionState.ERROR;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this._state === ConnectionState.DISCONNECTED) {
      return;
    }

    this._state = ConnectionState.CLOSING;

    if (this._socket) {
      await this._closeSocket();
    }

    this._state = ConnectionState.DISCONNECTED;
    this._remoteAddress = null;
    this._remotePort = null;
  }

  async send(data: NetworkBuffer): Promise<void> {
    if (this._state !== ConnectionState.CONNECTED) {
      throw new Error(`Cannot send data in state: ${this._state}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Send operation timeout'));
      }, this._timeout);

      this._socket.write(data, (error: Error | null) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async receive(): Promise<NetworkBuffer> {
    if (this._state !== ConnectionState.CONNECTED) {
      throw new Error(`Cannot receive data in state: ${this._state}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Receive operation timeout'));
      }, this._timeout);

      this._socket.once('data', (data: NetworkBuffer) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this._socket.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  getState(): ConnectionState {
    return this._state;
  }

  getId(): string {
    return this._id;
  }

  isConnected(): boolean {
    return this._state === ConnectionState.CONNECTED;
  }

  setTimeout(timeoutMs: number): void {
    this._timeout = timeoutMs;
  }

  getRemoteAddress(): string | null {
    return this._remoteAddress;
  }

  getRemotePort(): number | null {
    return this._remotePort;
  }

  async pause(): Promise<void> {
    if (this._state !== ConnectionState.CONNECTED) {
      throw new Error(`Cannot pause in state: ${this._state}`);
    }
    this._state = ConnectionState.PAUSED;
    if (this._socket) {
      this._socket.pause();
    }
  }

  async resume(): Promise<void> {
    if (this._state !== ConnectionState.PAUSED) {
      throw new Error(`Cannot resume in state: ${this._state}`);
    }
    this._state = ConnectionState.CONNECTED;
    if (this._socket) {
      this._socket.resume();
    }
  }

  async reconnect(config?: SocketConfig): Promise<void> {
    this._reconnectionAttempts++;
    this._state = ConnectionState.RECONNECTING;
    await this.disconnect();
    await this.connect(config || this._config!);
  }

  async sendWithOptions(data: NetworkBuffer, options: DataTransmissionOptions): Promise<void> {
    let processedData = data;

    if (options.compress && this._compressionEnabled) {
      processedData = this._compressData(data);
    }

    if (options.encrypt && this._encryptionEnabled) {
      processedData = this._encryptData(data);
    }

    if (options.retryOnFailure) {
      const maxRetries = options.maxRetries || 3;
      for (let i = 0; i < maxRetries; i++) {
        try {
          await this.send(processedData);
          return;
        } catch (error) {
          if (i === maxRetries - 1) {
            throw error;
          }
        }
      }
    } else {
      await this.send(processedData);
    }
  }

  getMetadata(): ConnectionMetadata {
    return { ...this._metadata };
  }

  updateMetadata(metadata: Partial<ConnectionMetadata>): void {
    this._metadata = { ...this._metadata, ...metadata };
  }

  getHealthStatus(): HealthStatus {
    const checks: HealthCheck[] = [];
    const now = Date.now();

    const uptimeCheck = this._performUptimeCheck(now);
    checks.push(uptimeCheck);

    const latencyCheck = this._performLatencyCheck();
    checks.push(latencyCheck);

    const errorCheck = this._performErrorCheck();
    checks.push(errorCheck);

    const score = this._calculateHealthScore(checks);
    const status = this._determineHealthStatus(score);

    return {
      status,
      score,
      checks,
      lastCheck: new Date(now),
    };
  }

  getBytesSent(): number {
    return this._bytesSent;
  }

  getBytesReceived(): number {
    return this._bytesReceived;
  }

  getLatency(): number {
    return this._latency;
  }

  getUptime(): number {
    return Date.now() - this._createdAt.getTime();
  }

  setPriority(priority: number): void {
    this._priority = priority;
  }

  getPriority(): number {
    return this._priority;
  }

  enableCompression(level: number): void {
    this._compressionEnabled = true;
    this._compressionLevel = level;
  }

  disableCompression(): void {
    this._compressionEnabled = false;
  }

  isCompressionEnabled(): boolean {
    return this._compressionEnabled;
  }

  enableEncryption(key: string): void {
    this._encryptionEnabled = true;
    this._encryptionKey = key;
  }

  disableEncryption(): void {
    this._encryptionEnabled = false;
    this._encryptionKey = null;
  }

  isEncryptionEnabled(): boolean {
    return this._encryptionEnabled;
  }

  getLastError(): Error | null {
    return this._lastError;
  }

  getErrorCount(): number {
    return this._errorCount;
  }

  resetErrorCount(): void {
    this._errorCount = 0;
    this._lastError = null;
  }

  getReconnectionAttempts(): number {
    return this._reconnectionAttempts;
  }

  getLocalAddress(): string | null {
    return this._localAddress;
  }

  getLocalPort(): number | null {
    return this._localPort;
  }

  isWritable(): boolean {
    return this._state === ConnectionState.CONNECTED && this._socket && this._socket.writable;
  }

  isReadable(): boolean {
    return this._state === ConnectionState.CONNECTED && this._socket && this._socket.readable;
  }

  destroySoon(): void {
    if (this._socket) {
      this._socket.end();
    }
  }

  destroy(): void {
    if (this._socket) {
      this._socket.destroy();
    }
    this._state = ConnectionState.DISCONNECTED;
  }

  getConfig(): ConnectionConfig {
    return this._connectionConfig || {
      socket: this._config || { host: '', port: 0 },
    };
  }

  updateConfig(config: Partial<ConnectionConfig>): void {
    if (this._connectionConfig) {
      this._connectionConfig = { ...this._connectionConfig, ...config };
    }
  }

  getSendBufferSize(): number {
    return this._sendBufferSize;
  }

  getReceiveBufferSize(): number {
    return this._receiveBufferSize;
  }

  setSendBufferSize(size: number): void {
    this._sendBufferSize = size;
    if (this._socket) {
      this._socket.setSendBufferSize(size);
    }
  }

  setReceiveBufferSize(size: number): void {
    this._receiveBufferSize = size;
    if (this._socket) {
      this._socket.setReceiveBufferSize(size);
    }
  }

  getBufferedAmount(): number {
    return this._socket ? this._socket.bufferSize : 0;
  }

  async flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._socket) {
        resolve();
        return;
      }

      this._socket.once('drain', () => {
        resolve();
      });

      if (!this._socket.writable) {
        resolve();
      }
    });
  }

  private async _createSocket(config: SocketConfig): Promise<void> {
    const net = require('net');

    return new Promise((resolve, reject) => {
      this._socket = new net.Socket({
        allowHalfOpen: config.allowHalfOpen || false,
      });

      this._socket.setTimeout(config.timeout || this._timeout);
      this._socket.setNoDelay(config.noDelay || true);
      this._socket.setKeepAlive(config.keepAlive || false, config.keepAliveInitialDelay || 0);

      this._socket.on('connect', () => {
        this._remoteAddress = this._socket.remoteAddress;
        this._remotePort = this._socket.remotePort;
        this._localAddress = this._socket.localAddress;
        this._localPort = this._socket.localPort;
        this._connectionConfig = {
          socket: config,
          priority: this._priority,
        };
        resolve();
      });

      this._socket.on('data', (data: NetworkBuffer) => {
        this._bytesReceived += data.length;
        this._lastActiveAt = new Date();
      });

      this._socket.on('error', (error: Error) => {
        this._lastError = error;
        this._errorCount++;
        this._metadata.errorCount++;
        reject(error);
      });

      this._socket.connect(config.port, config.host);
    });
  }

  private async _closeSocket(): Promise<void> {
    return new Promise((resolve) => {
      this._socket.end(() => {
        this._socket.destroy();
        resolve();
      });
    });
  }

  private _compressData(data: NetworkBuffer): NetworkBuffer {
    return data;
  }

  private _encryptData(data: NetworkBuffer): NetworkBuffer {
    return data;
  }

  private _performUptimeCheck(now: number): HealthCheck {
    const uptime = now - this._createdAt.getTime();
    const isHealthy = uptime > 0;
    return {
      name: 'uptime',
      status: isHealthy ? 'pass' : 'fail',
      message: `Uptime: ${uptime}ms`,
      duration: 0,
    };
  }

  private _performLatencyCheck(): HealthCheck {
    const isHealthy = this._latency < 1000;
    return {
      name: 'latency',
      status: isHealthy ? 'pass' : 'warn',
      message: `Latency: ${this._latency}ms`,
      duration: 0,
    };
  }

  private _performErrorCheck(): HealthCheck {
    const isHealthy = this._errorCount === 0;
    return {
      name: 'errors',
      status: isHealthy ? 'pass' : this._errorCount < 5 ? 'warn' : 'fail',
      message: `Error count: ${this._errorCount}`,
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
}
