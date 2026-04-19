/**
 * Network Configuration Builder Tests
 * 
 * Unit tests for NetworkConfigBuilder using AAA pattern.
 */

import { NetworkConfigBuilder } from '../builders/NetworkConfigBuilder';
import { ConnectionPriorityEnum } from '../../domain/value-objects/ConnectionPriority';
import { ConnectionTypeEnum } from '../../domain/value-objects/ConnectionType';

describe('NetworkConfigBuilder', () => {
  describe('create', () => {
    it('should create default configuration', () => {
      const config = NetworkConfigBuilder.create().build();
      
      expect(config.maxConnections).toBe(100);
      expect(config.defaultTimeout).toBe(30000);
      expect(config.keepAlive).toBe(true);
    });
  });

  describe('highPerformance', () => {
    it('should create high-performance configuration', () => {
      const config = NetworkConfigBuilder.highPerformance().build();
      
      expect(config.maxConnections).toBe(1000);
      expect(config.defaultTimeout).toBe(10000);
      expect(config.enableCompression).toBe(true);
    });
  });

  describe('secure', () => {
    it('should create secure configuration', () => {
      const config = NetworkConfigBuilder.secure().build();
      
      expect(config.connectionType).toBe(ConnectionTypeEnum.TLS);
      expect(config.enableEncryption).toBe(true);
    });
  });

  describe('development', () => {
    it('should create development configuration', () => {
      const config = NetworkConfigBuilder.development().build();
      
      expect(config.maxConnections).toBe(10);
      expect(config.keepAlive).toBe(false);
      expect(config.maxRetries).toBe(0);
    });
  });

  describe('production', () => {
    it('should create production configuration', () => {
      const config = NetworkConfigBuilder.production().build();
      
      expect(config.maxConnections).toBe(500);
      expect(config.connectionType).toBe(ConnectionTypeEnum.TLS);
      expect(config.enableEncryption).toBe(true);
    });
  });

  describe('withMaxConnections', () => {
    it('should set max connections', () => {
      const config = NetworkConfigBuilder.create()
        .withMaxConnections(50)
        .build();
      
      expect(config.maxConnections).toBe(50);
    });

    it('should throw error for invalid max connections', () => {
      expect(() => NetworkConfigBuilder.create().withMaxConnections(0)).toThrow();
      expect(() => NetworkConfigBuilder.create().withMaxConnections(200000)).toThrow();
    });
  });

  describe('withTimeout', () => {
    it('should set timeout in milliseconds', () => {
      const config = NetworkConfigBuilder.create()
        .withTimeout(5000)
        .build();
      
      expect(config.defaultTimeout).toBe(5000);
    });

    it('should set timeout in seconds', () => {
      const config = NetworkConfigBuilder.create()
        .withTimeoutSeconds(5)
        .build();
      
      expect(config.defaultTimeout).toBe(5000);
    });
  });

  describe('withPriority', () => {
    it('should set connection priority', () => {
      const config = NetworkConfigBuilder.create()
        .withPriority(ConnectionPriorityEnum.HIGH)
        .build();
      
      expect(config.priority).toBe(ConnectionPriorityEnum.HIGH);
    });
  });

  describe('withConnectionType', () => {
    it('should set connection type', () => {
      const config = NetworkConfigBuilder.create()
        .withConnectionType(ConnectionTypeEnum.TLS)
        .build();
      
      expect(config.connectionType).toBe(ConnectionTypeEnum.TLS);
    });
  });

  describe('fluent interface', () => {
    it('should support method chaining', () => {
      const config = NetworkConfigBuilder.create()
        .withMaxConnections(200)
        .withTimeout(10000)
        .withPriority(ConnectionPriorityEnum.HIGH)
        .withCompression(true)
        .withMetrics(true)
        .build();
      
      expect(config.maxConnections).toBe(200);
      expect(config.defaultTimeout).toBe(10000);
      expect(config.priority).toBe(ConnectionPriorityEnum.HIGH);
      expect(config.enableCompression).toBe(true);
      expect(config.enableMetrics).toBe(true);
    });
  });
});
