/**
 * Network Manager Integration Unit Tests
 * 
 * Integration tests for NetworkManager implementation.
 * Tests interaction between different components and end-to-end scenarios.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { NetworkManager } from '../implementations/NetworkManager';

describe('NetworkManager Integration', () => {
  let manager: NetworkManager;

  beforeEach(() => {
    manager = new NetworkManager();
  });

  describe('Full Lifecycle', () => {
    it('should handle full manager lifecycle', async () => {
      const uptime1 = manager.getUptime();
      const stats1 = manager.getStats();

      manager.setPoolConfig({ minConnections: 2, maxConnections: 50, acquireTimeout: 15000, idleTimeout: 30000, maxLifetime: 1800000 });
      manager.setSecurityConfig({ enableIPWhitelist: true, ipWhitelist: ['127.0.0.1'], enableIPBlacklist: false, ipBlacklist: [], enableRateLimit: true, rateLimitMax: 50, rateLimitWindow: 30000, enableTLS: false });

      const poolConfig = manager.getPoolConfig();
      const securityConfig = manager.getSecurityConfig();

      const health = manager.getHealthStatus();
      const diagnostics = await manager.runDiagnostics();

      const uptime2 = manager.getUptime();
      const stats2 = manager.getStats();

      expect(uptime2).toBeGreaterThanOrEqual(uptime1);
      expect(poolConfig.minConnections).toBe(2);
      expect(securityConfig.enableIPWhitelist).toBe(true);
      expect(health.status).toBe('healthy');
      expect(diagnostics.steps.length).toBe(3);
    });
  });

  describe('Configuration Chain', () => {
    it('should handle configuration chain updates', () => {
      manager.setPoolConfig({ minConnections: 5, maxConnections: 100, acquireTimeout: 30000, idleTimeout: 60000, maxLifetime: 3600000 });
      manager.setBandwidthConfig({ enabled: true, maxBytesPerSecond: 2048 * 1024, bucketSize: 2048 * 1024, refillRate: 2048 * 1024 });
      manager.setMonitoringConfig({ enableHeartbeat: false, heartbeatInterval: 60000, enableLatencyTracking: true, enableThroughputTracking: true, enableErrorTracking: true, alertThresholds: { latencyMs: 2000, errorRate: 0.2, connectionDropRate: 0.1, memoryUsageMB: 1024 } });

      const poolConfig = manager.getPoolConfig();
      const bandwidthConfig = manager.getBandwidthConfig();
      const monitoringConfig = manager.getMonitoringConfig();

      expect(poolConfig.minConnections).toBe(5);
      expect(bandwidthConfig.enabled).toBe(true);
      expect(monitoringConfig.enableHeartbeat).toBe(false);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics across operations', () => {
      const stats1 = manager.getStats();

      manager.setMaxConnections(50);
      manager.setPoolConfig({ minConnections: 1, maxConnections: 50, acquireTimeout: 30000, idleTimeout: 60000, maxLifetime: 3600000 });

      const stats2 = manager.getStats();
      const poolStats = manager.getPoolStats();

      expect(stats2).toBeDefined();
      expect(poolStats.totalConnections).toBe(0);
    });
  });

  describe('State Persistence', () => {
    it('should persist and restore state', () => {
      const state1 = manager.exportState();

      manager.setPoolConfig({ minConnections: 10, maxConnections: 200, acquireTimeout: 60000, idleTimeout: 120000, maxLifetime: 7200000 });
      manager.setSecurityConfig({ enableIPWhitelist: true, ipWhitelist: ['192.168.1.1'], enableIPBlacklist: true, ipBlacklist: ['10.0.0.1'], enableRateLimit: true, rateLimitMax: 200, rateLimitWindow: 120000, enableTLS: true });

      const state2 = manager.exportState();

      manager.importState(state1);
      const state3 = manager.exportState();

      expect(state3.stats).toEqual(state1.stats);
      expect(state3.poolConfig).toEqual(state1.poolConfig);
    });
  });

  describe('Event System', () => {
    it('should handle event subscription and broadcasting', async () => {
      const handler = { handle: jest.fn() };
      const subscription = { handler, once: false, priority: 1 };

      const subscriptionId = manager.subscribeToEvents(subscription);

      const subscriptions = manager.getEventSubscriptions();

      manager.unsubscribeFromEvents(subscriptionId);

      const subscriptionsAfter = manager.getEventSubscriptions();

      expect(subscriptions.size).toBe(1);
      expect(subscriptionsAfter.size).toBe(0);
    });
  });

  describe('Health and Diagnostics Integration', () => {
    it('should integrate health checks with diagnostics', async () => {
      const health = manager.getHealthStatus();
      const diagnostics = await manager.runDiagnostics();

      expect(health.checks.length).toBeGreaterThan(0);
      expect(diagnostics.steps.length).toBeGreaterThan(0);
      expect(health.status).toBe('healthy');
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Connection Pool Integration', () => {
    it('should integrate pool configuration with max connections', () => {
      manager.setMaxConnections(50);
      manager.setPoolConfig({ minConnections: 5, maxConnections: 50, acquireTimeout: 30000, idleTimeout: 60000, maxLifetime: 3600000 });

      const maxConnections = manager.getMaxConnections();
      const poolConfig = manager.getPoolConfig();

      expect(maxConnections).toBe(50);
      expect(poolConfig.maxConnections).toBe(50);
    });
  });

  describe('Security and Monitoring Integration', () => {
    it('should integrate security with monitoring', () => {
      manager.setSecurityConfig({ enableIPWhitelist: true, ipWhitelist: ['127.0.0.1'], enableIPBlacklist: false, ipBlacklist: [], enableRateLimit: true, rateLimitMax: 100, rateLimitWindow: 60000, enableTLS: false });
      manager.setMonitoringConfig({ enableHeartbeat: true, heartbeatInterval: 30000, enableLatencyTracking: true, enableThroughputTracking: true, enableErrorTracking: true, alertThresholds: { latencyMs: 1000, errorRate: 0.1, connectionDropRate: 0.05, memoryUsageMB: 512 } });

      const securityConfig = manager.getSecurityConfig();
      const monitoringConfig = manager.getMonitoringConfig();

      expect(securityConfig.enableRateLimit).toBe(true);
      expect(monitoringConfig.enableHeartbeat).toBe(true);
    });
  });
});
