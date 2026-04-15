/**
 * Network Connection Advanced Unit Tests
 * 
 * Advanced tests for NetworkConnection implementation.
 * Tests compression, encryption, health status, metadata, and advanced features.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { NetworkConnection } from '../implementations/NetworkConnection';
import { ConnectionState } from '../types/network-types';

describe('NetworkConnection Advanced', () => {
  let connection: NetworkConnection;

  beforeEach(() => {
    connection = new NetworkConnection();
  });

  describe('Compression', () => {
    it('should enable compression', () => {
      connection.enableCompression(6);

      expect(connection.isCompressionEnabled()).toBe(true);
    });

    it('should disable compression', () => {
      connection.enableCompression(6);
      connection.disableCompression();

      expect(connection.isCompressionEnabled()).toBe(false);
    });

    it('should not be enabled by default', () => {
      expect(connection.isCompressionEnabled()).toBe(false);
    });
  });

  describe('Encryption', () => {
    it('should enable encryption with key', () => {
      connection.enableEncryption('test-key');

      expect(connection.isEncryptionEnabled()).toBe(true);
    });

    it('should disable encryption', () => {
      connection.enableEncryption('test-key');
      connection.disableEncryption();

      expect(connection.isEncryptionEnabled()).toBe(false);
    });

    it('should not be enabled by default', () => {
      expect(connection.isEncryptionEnabled()).toBe(false);
    });
  });

  describe('Health Status', () => {
    it('should return healthy status for new connection', () => {
      const health = connection.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(80);
      expect(health.checks).toHaveLength(3);
    });

    it('should include uptime check', () => {
      const health = connection.getHealthStatus();

      const uptimeCheck = health.checks.find((c) => c.name === 'uptime');
      expect(uptimeCheck).toBeDefined();
      expect(uptimeCheck?.status).toBe('pass');
    });

    it('should include latency check', () => {
      const health = connection.getHealthStatus();

      const latencyCheck = health.checks.find((c) => c.name === 'latency');
      expect(latencyCheck).toBeDefined();
    });

    it('should include error check', () => {
      const health = connection.getHealthStatus();

      const errorCheck = health.checks.find((c) => c.name === 'errors');
      expect(errorCheck).toBeDefined();
    });
  });

  describe('Metadata', () => {
    it('should return default metadata', () => {
      const metadata = connection.getMetadata();

      expect(metadata.createdAt).toBeInstanceOf(Date);
      expect(metadata.totalBytesSent).toBe(0);
      expect(metadata.totalBytesReceived).toBe(0);
    });

    it('should update metadata', () => {
      connection.updateMetadata({ requestCount: 10 });

      const metadata = connection.getMetadata();
      expect(metadata.requestCount).toBe(10);
    });

    it('should merge metadata updates', () => {
      connection.updateMetadata({ requestCount: 5 });
      connection.updateMetadata({ errorCount: 2 });

      const metadata = connection.getMetadata();
      expect(metadata.requestCount).toBe(5);
      expect(metadata.errorCount).toBe(2);
    });
  });

  describe('Priority', () => {
    it('should set and get priority', () => {
      connection.setPriority(3);

      expect(connection.getPriority()).toBe(3);
    });

    it('should have default priority of 1', () => {
      expect(connection.getPriority()).toBe(1);
    });
  });

  describe('Error Tracking', () => {
    it('should track error count', () => {
      const error = new Error('Test error');

      expect(connection.getErrorCount()).toBe(0);
      expect(connection.getLastError()).toBeNull();
    });

    it('should reset error count', () => {
      connection.resetErrorCount();

      expect(connection.getErrorCount()).toBe(0);
      expect(connection.getLastError()).toBeNull();
    });
  });

  describe('Reconnection Attempts', () => {
    it('should track reconnection attempts', () => {
      const attempts = connection.getReconnectionAttempts();

      expect(attempts).toBe(0);
    });
  });

  describe('Buffer Management', () => {
    it('should set and get send buffer size', () => {
      connection.setSendBufferSize(131072);

      expect(connection.getSendBufferSize()).toBe(131072);
    });

    it('should set and get receive buffer size', () => {
      connection.setReceiveBufferSize(131072);

      expect(connection.getReceiveBufferSize()).toBe(131072);
    });

    it('should have default buffer sizes', () => {
      expect(connection.getSendBufferSize()).toBe(65536);
      expect(connection.getReceiveBufferSize()).toBe(65536);
    });

    it('should return zero buffered amount when disconnected', () => {
      expect(connection.getBufferedAmount()).toBe(0);
    });
  });

  describe('Uptime', () => {
    it('should return uptime in milliseconds', () => {
      const uptime = connection.getUptime();

      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(uptime).toBeLessThan(100);
    });
  });

  describe('Bytes Tracking', () => {
    it('should track bytes sent', () => {
      const bytesSent = connection.getBytesSent();

      expect(bytesSent).toBe(0);
    });

    it('should track bytes received', () => {
      const bytesReceived = connection.getBytesReceived();

      expect(bytesReceived).toBe(0);
    });
  });

  describe('Latency', () => {
    it('should return latency', () => {
      const latency = connection.getLatency();

      expect(latency).toBe(0);
    });
  });

  describe('Local Address', () => {
    it('should return null local address when disconnected', () => {
      expect(connection.getLocalAddress()).toBeNull();
    });

    it('should return null local port when disconnected', () => {
      expect(connection.getLocalPort()).toBeNull();
    });
  });

  describe('Read/Write Status', () => {
    it('should not be writable when disconnected', () => {
      expect(connection.isWritable()).toBe(false);
    });

    it('should not be readable when disconnected', () => {
      expect(connection.isReadable()).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should return default config', () => {
      const config = connection.getConfig();

      expect(config.socket).toBeDefined();
    });

    it('should update config', () => {
      connection.updateConfig({ priority: 2 });

      const config = connection.getConfig();
      expect(config.priority).toBe(2);
    });
  });

  describe('Destroy Operations', () => {
    it('should set destroy soon', () => {
      connection.destroySoon();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should destroy immediately', () => {
      connection.destroy();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('Pause and Resume', () => {
    it('should throw error when pausing disconnected connection', async () => {
      await expect(connection.pause()).rejects.toThrow();
    });

    it('should throw error when resuming disconnected connection', async () => {
      await expect(connection.resume()).rejects.toThrow();
    });
  });

  describe('Reconnect', () => {
    it('should increment reconnection attempts on reconnect', async () => {
      connection.updateConfig({ socket: { host: 'localhost', port: 8080 } });

      await expect(connection.reconnect()).rejects.toThrow();
      expect(connection.getReconnectionAttempts()).toBe(1);
    });
  });
});
