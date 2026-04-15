/**
 * Network Connection Unit Tests
 * 
 * Tests for NetworkConnection implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { NetworkConnection } from '../implementations/NetworkConnection';
import { ConnectionState, SocketConfig } from '../types/network-types';

describe('NetworkConnection', () => {
  let connection: NetworkConnection;
  let mockConfig: SocketConfig;

  beforeEach(() => {
    connection = new NetworkConnection();
    mockConfig = {
      host: 'localhost',
      port: 3000,
      timeout: 5000,
      keepAlive: true,
    };
  });

  afterEach(async () => {
    if (connection.isConnected()) {
      await connection.disconnect();
    }
  });

  describe('getId', () => {
    it('should return a unique connection ID', () => {
      const id = connection.getId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should return the same ID for the same connection', () => {
      const id1 = connection.getId();
      const id2 = connection.getId();

      expect(id1).toBe(id2);
    });
  });

  describe('getState', () => {
    it('should return DISCONNECTED state initially', () => {
      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(connection.isConnected()).toBe(false);
    });
  });

  describe('setTimeout', () => {
    it('should set the timeout value without throwing', () => {
      expect(() => connection.setTimeout(10000)).not.toThrow();
    });
  });

  describe('getRemoteAddress', () => {
    it('should return null when not connected', () => {
      expect(connection.getRemoteAddress()).toBeNull();
    });
  });

  describe('getRemotePort', () => {
    it('should return null when not connected', () => {
      expect(connection.getRemotePort()).toBeNull();
    });
  });

  describe('connect', () => {
    it('should transition to CONNECTING state during connection', async () => {
      const connectPromise = connection.connect(mockConfig);

      expect(connection.getState()).toBe(ConnectionState.CONNECTING);

      await connectPromise.catch(() => {});
    });

    it('should throw error when connection fails', async () => {
      const invalidConfig: SocketConfig = {
        host: 'invalid-host-that-does-not-exist',
        port: 99999,
      };

      await expect(connection.connect(invalidConfig)).rejects.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should transition to DISCONNECTED state after disconnect', async () => {
      await connection.disconnect();

      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should not throw when disconnecting already disconnected connection', async () => {
      await expect(connection.disconnect()).resolves.not.toThrow();
    });
  });

  describe('send', () => {
    it('should throw error when not connected', async () => {
      const data = Buffer.from('test data');

      await expect(connection.send(data)).rejects.toThrow();
    });
  });

  describe('receive', () => {
    it('should throw error when not connected', async () => {
      await expect(connection.receive()).rejects.toThrow();
    });
  });
});
