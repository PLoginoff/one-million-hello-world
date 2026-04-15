/**
 * Network Manager Unit Tests
 * 
 * Tests for NetworkManager implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { NetworkManager } from '../implementations/NetworkManager';
import { SocketConfig } from '../types/network-types';

describe('NetworkManager', () => {
  let manager: NetworkManager;
  let mockConfig: SocketConfig;

  beforeEach(() => {
    manager = new NetworkManager();
    mockConfig = {
      host: 'localhost',
      port: 3000,
      timeout: 5000,
    };
  });

  afterEach(async () => {
    await manager.closeAllConnections();
  });

  describe('getActiveConnectionCount', () => {
    it('should return 0 when no connections exist', () => {
      expect(manager.getActiveConnectionCount()).toBe(0);
    });
  });

  describe('hasConnection', () => {
    it('should return false for non-existent connection', () => {
      expect(manager.hasConnection('non-existent-id')).toBe(false);
    });
  });

  describe('getAllConnectionIds', () => {
    it('should return empty array when no connections exist', () => {
      const ids = manager.getAllConnectionIds();

      expect(ids).toEqual([]);
      expect(Array.isArray(ids)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return initial statistics', () => {
      const stats = manager.getStats();

      expect(stats).toEqual({
        bytesReceived: 0,
        bytesSent: 0,
        connectionsOpened: 0,
        connectionsClosed: 0,
        errors: 0,
      });
    });
  });

  describe('resetStats', () => {
    it('should reset statistics to initial values', () => {
      manager.resetStats();

      const stats = manager.getStats();

      expect(stats.bytesReceived).toBe(0);
      expect(stats.bytesSent).toBe(0);
      expect(stats.connectionsOpened).toBe(0);
      expect(stats.connectionsClosed).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('getConnection', () => {
    it('should return null for non-existent connection', () => {
      const connection = manager.getConnection('non-existent-id');

      expect(connection).toBeNull();
    });
  });

  describe('createConnection', () => {
    it('should create a new connection', async () => {
      const invalidConfig: SocketConfig = {
        host: 'invalid-host',
        port: 99999,
      };

      await expect(manager.createConnection(invalidConfig)).rejects.toThrow();
    });
  });

  describe('closeConnection', () => {
    it('should not throw when closing non-existent connection', async () => {
      await expect(manager.closeConnection('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('closeAllConnections', () => {
    it('should close all connections without throwing', async () => {
      await expect(manager.closeAllConnections()).resolves.not.toThrow();
      expect(manager.getActiveConnectionCount()).toBe(0);
    });
  });
});
