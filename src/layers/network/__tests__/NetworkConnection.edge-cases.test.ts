/**
 * Network Connection Edge Cases Unit Tests
 * 
 * Edge case tests for NetworkConnection implementation.
 * Tests error handling, timeout scenarios, and boundary conditions.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { NetworkConnection } from '../implementations/NetworkConnection';
import { ConnectionState } from '../types/network-types';

describe('NetworkConnection Edge Cases', () => {
  let connection: NetworkConnection;

  beforeEach(() => {
    connection = new NetworkConnection();
  });

  describe('Connection State Transitions', () => {
    it('should handle disconnect when already disconnected', async () => {
      await connection.disconnect();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should handle send when disconnected', async () => {
      const data = Buffer.from('test');

      await expect(connection.send(data)).rejects.toThrow();
    });

    it('should handle receive when disconnected', async () => {
      await expect(connection.receive()).rejects.toThrow();
    });
  });

  describe('Timeout Scenarios', () => {
    it('should set timeout to zero', () => {
      connection.setTimeout(0);

      expect(connection.isConnected()).toBe(false);
    });

    it('should set timeout to large value', () => {
      connection.setTimeout(999999);

      expect(connection.isConnected()).toBe(false);
    });
  });

  describe('Buffer Size Edge Cases', () => {
    it('should set buffer size to minimum', () => {
      connection.setSendBufferSize(1024);

      expect(connection.getSendBufferSize()).toBe(1024);
    });

    it('should set buffer size to maximum', () => {
      connection.setSendBufferSize(1024 * 1024 * 10);

      expect(connection.getSendBufferSize()).toBe(1024 * 1024 * 10);
    });

    it('should set receive buffer size to minimum', () => {
      connection.setReceiveBufferSize(1024);

      expect(connection.getReceiveBufferSize()).toBe(1024);
    });
  });

  describe('Priority Edge Cases', () => {
    it('should set priority to minimum', () => {
      connection.setPriority(0);

      expect(connection.getPriority()).toBe(0);
    });

    it('should set priority to maximum', () => {
      connection.setPriority(999);

      expect(connection.getPriority()).toBe(999);
    });

    it('should set priority to negative value', () => {
      connection.setPriority(-1);

      expect(connection.getPriority()).toBe(-1);
    });
  });

  describe('Compression Edge Cases', () => {
    it('should enable compression with minimum level', () => {
      connection.enableCompression(0);

      expect(connection.isCompressionEnabled()).toBe(true);
    });

    it('should enable compression with maximum level', () => {
      connection.enableCompression(9);

      expect(connection.isCompressionEnabled()).toBe(true);
    });

    it('should enable compression with invalid level', () => {
      connection.enableCompression(10);

      expect(connection.isCompressionEnabled()).toBe(true);
    });
  });

  describe('Encryption Edge Cases', () => {
    it('should enable encryption with empty key', () => {
      connection.enableEncryption('');

      expect(connection.isEncryptionEnabled()).toBe(true);
    });

    it('should enable encryption with very long key', () => {
      const longKey = 'a'.repeat(10000);
      connection.enableEncryption(longKey);

      expect(connection.isEncryptionEnabled()).toBe(true);
    });
  });

  describe('Metadata Edge Cases', () => {
    it('should update metadata with empty object', () => {
      connection.updateMetadata({});

      const metadata = connection.getMetadata();
      expect(metadata).toBeDefined();
    });

    it('should update metadata with null values', () => {
      connection.updateMetadata({ userContext: null });

      const metadata = connection.getMetadata();
      expect(metadata.userContext).toBeNull();
    });
  });

  describe('Error Count Edge Cases', () => {
    it('should reset error count multiple times', () => {
      connection.resetErrorCount();
      connection.resetErrorCount();
      connection.resetErrorCount();

      expect(connection.getErrorCount()).toBe(0);
    });
  });

  describe('Uptime Edge Cases', () => {
    it('should return uptime immediately after creation', () => {
      const uptime = connection.getUptime();

      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(uptime).toBeLessThan(100);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should update config with empty object', () => {
      connection.updateConfig({});

      const config = connection.getConfig();
      expect(config).toBeDefined();
    });
  });

  describe('Destruction Edge Cases', () => {
    it('should handle destroy when already destroyed', () => {
      connection.destroy();
      connection.destroy();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should handle destroySoon when already destroyed', () => {
      connection.destroy();
      connection.destroySoon();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });
});
