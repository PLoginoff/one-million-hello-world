/**
 * Network Connection Integration Unit Tests
 * 
 * Integration tests for NetworkConnection implementation.
 * Tests interaction between different connection features.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { NetworkConnection } from '../implementations/NetworkConnection';
import { ConnectionState } from '../types/network-types';

describe('NetworkConnection Integration', () => {
  let connection: NetworkConnection;

  beforeEach(() => {
    connection = new NetworkConnection();
  });

  describe('Compression and Encryption Integration', () => {
    it('should handle both compression and encryption enabled', () => {
      connection.enableCompression(6);
      connection.enableEncryption('test-key');

      expect(connection.isCompressionEnabled()).toBe(true);
      expect(connection.isEncryptionEnabled()).toBe(true);
    });

    it('should disable both compression and encryption', () => {
      connection.enableCompression(6);
      connection.enableEncryption('test-key');
      connection.disableCompression();
      connection.disableEncryption();

      expect(connection.isCompressionEnabled()).toBe(false);
      expect(connection.isEncryptionEnabled()).toBe(false);
    });
  });

  describe('Metadata and Priority Integration', () => {
    it('should integrate metadata with priority', () => {
      connection.setPriority(3);
      connection.updateMetadata({ requestCount: 100, errorCount: 5 });

      const priority = connection.getPriority();
      const metadata = connection.getMetadata();

      expect(priority).toBe(3);
      expect(metadata.requestCount).toBe(100);
      expect(metadata.errorCount).toBe(5);
    });
  });

  describe('Buffer Management and State Integration', () => {
    it('should integrate buffer sizes with connection state', () => {
      connection.setSendBufferSize(131072);
      connection.setReceiveBufferSize(131072);

      const sendBufferSize = connection.getSendBufferSize();
      const receiveBufferSize = connection.getReceiveBufferSize();
      const state = connection.getState();

      expect(sendBufferSize).toBe(131072);
      expect(receiveBufferSize).toBe(131072);
      expect(state).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('Health and Error Tracking Integration', () => {
    it('should integrate health status with error tracking', () => {
      connection.resetErrorCount();

      const health = connection.getHealthStatus();
      const errorCount = connection.getErrorCount();

      expect(health.status).toBe('healthy');
      expect(errorCount).toBe(0);
    });
  });

  describe('Configuration and Metadata Integration', () => {
    it('should integrate configuration with metadata', () => {
      connection.updateConfig({ priority: 2 });
      connection.updateMetadata({ userContext: { userId: '123' } });

      const config = connection.getConfig();
      const metadata = connection.getMetadata();

      expect(config.priority).toBe(2);
      expect(metadata.userContext).toEqual({ userId: '123' });
    });
  });

  describe('Uptime and Latency Integration', () => {
    it('should integrate uptime with latency tracking', () => {
      const uptime = connection.getUptime();
      const latency = connection.getLatency();

      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(latency).toBe(0);
    });
  });

  describe('Bytes Tracking and Metadata Integration', () => {
    it('should integrate bytes tracking with metadata', () => {
      const bytesSent = connection.getBytesSent();
      const bytesReceived = connection.getBytesReceived();
      const metadata = connection.getMetadata();

      expect(bytesSent).toBe(0);
      expect(bytesReceived).toBe(0);
      expect(metadata.totalBytesSent).toBe(0);
      expect(metadata.totalBytesReceived).toBe(0);
    });
  });

  describe('Full Feature Integration', () => {
    it('should handle full feature set integration', () => {
      connection.setPriority(2);
      connection.enableCompression(6);
      connection.enableEncryption('test-key');
      connection.setSendBufferSize(131072);
      connection.setReceiveBufferSize(131072);
      connection.updateMetadata({ requestCount: 50 });

      const priority = connection.getPriority();
      const compressionEnabled = connection.isCompressionEnabled();
      const encryptionEnabled = connection.isEncryptionEnabled();
      const sendBufferSize = connection.getSendBufferSize();
      const metadata = connection.getMetadata();

      expect(priority).toBe(2);
      expect(compressionEnabled).toBe(true);
      expect(encryptionEnabled).toBe(true);
      expect(sendBufferSize).toBe(131072);
      expect(metadata.requestCount).toBe(50);
    });
  });
});
