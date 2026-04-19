/**
 * Network Factory Tests
 * 
 * Unit tests for NetworkFactory using AAA pattern.
 */

import { NetworkFactory } from '../NetworkFactory';
import { ConnectionPriorityEnum } from '../../domain/value-objects/ConnectionPriority';
import { ConnectionTypeEnum } from '../../domain/value-objects/ConnectionType';

describe('NetworkFactory', () => {
  describe('createDefaultConfig', () => {
    it('should create default configuration', () => {
      const config = NetworkFactory.createDefaultConfig();
      
      expect(config).toBeDefined();
      expect(config.maxConnections).toBe(100);
      expect(config.defaultTimeout).toBe(30000);
    });
  });

  describe('createHighPerformanceConfig', () => {
    it('should create high-performance configuration', () => {
      const config = NetworkFactory.createHighPerformanceConfig();
      
      expect(config.maxConnections).toBe(1000);
      expect(config.enableCompression).toBe(true);
    });
  });

  describe('createSecureConfig', () => {
    it('should create secure configuration', () => {
      const config = NetworkFactory.createSecureConfig();
      
      expect(config.connectionType).toBe(ConnectionTypeEnum.TLS);
      expect(config.enableEncryption).toBe(true);
    });
  });

  describe('createDevelopmentConfig', () => {
    it('should create development configuration', () => {
      const config = NetworkFactory.createDevelopmentConfig();
      
      expect(config.maxConnections).toBe(10);
      expect(config.keepAlive).toBe(false);
    });
  });

  describe('createProductionConfig', () => {
    it('should create production configuration', () => {
      const config = NetworkFactory.createProductionConfig();
      
      expect(config.maxConnections).toBe(500);
      expect(config.connectionType).toBe(ConnectionTypeEnum.TLS);
    });
  });

  describe('createCustomConfig', () => {
    it('should create custom configuration using builder function', () => {
      const config = NetworkFactory.createCustomConfig((builder) =>
        builder
          .withMaxConnections(250)
          .withTimeout(15000)
          .withPriority(ConnectionPriorityEnum.HIGH)
      );
      
      expect(config.maxConnections).toBe(250);
      expect(config.defaultTimeout).toBe(15000);
      expect(config.priority).toBe(ConnectionPriorityEnum.HIGH);
    });
  });

  describe('createConnectionId', () => {
    it('should create connection ID', () => {
      const id = NetworkFactory.createConnectionId();
      
      expect(id).toBeDefined();
      expect(id.value).toBeDefined();
    });

    it('should create connection ID with prefix', () => {
      const id = NetworkFactory.createConnectionId('custom');
      
      expect(id.getPrefix()).toBe('custom');
    });
  });

  describe('createEndpoint', () => {
    it('should create network endpoint', () => {
      const endpoint = NetworkFactory.createEndpoint('localhost', 3000);
      
      expect(endpoint.host).toBe('localhost');
      expect(endpoint.port).toBe(3000);
    });

    it('should create secure endpoint', () => {
      const endpoint = NetworkFactory.createSecureEndpoint('localhost', 443);
      
      expect(endpoint.isSecure()).toBe(true);
    });

    it('should create endpoint from address', () => {
      const endpoint = NetworkFactory.createEndpointFromAddress('localhost:3000');
      
      expect(endpoint.host).toBe('localhost');
      expect(endpoint.port).toBe(3000);
    });

    it('should create endpoint from URL', () => {
      const endpoint = NetworkFactory.createEndpointFromUrl('http://example.com:8080');
      
      expect(endpoint.host).toBe('example.com');
      expect(endpoint.port).toBe(8080);
    });
  });

  describe('createPriority', () => {
    it('should create low priority', () => {
      const priority = NetworkFactory.createPriority('low');
      
      expect(priority.isLow()).toBe(true);
    });

    it('should create normal priority', () => {
      const priority = NetworkFactory.createPriority('normal');
      
      expect(priority.isNormal()).toBe(true);
    });

    it('should create high priority', () => {
      const priority = NetworkFactory.createPriority('high');
      
      expect(priority.isHigh()).toBe(true);
    });

    it('should create critical priority', () => {
      const priority = NetworkFactory.createPriority('critical');
      
      expect(priority.isCritical()).toBe(true);
    });
  });

  describe('createConnectionType', () => {
    it('should create TCP connection type', () => {
      const type = NetworkFactory.createConnectionType('tcp');
      
      expect(type.isTcp()).toBe(true);
    });

    it('should create TLS connection type', () => {
      const type = NetworkFactory.createConnectionType('tls');
      
      expect(type.isTls()).toBe(true);
    });

    it('should create WebSocket connection type', () => {
      const type = NetworkFactory.createConnectionType('websocket');
      
      expect(type.isWebsocket()).toBe(true);
    });
  });

  describe('createNetworkStack', () => {
    it('should create complete network stack', () => {
      const stack = NetworkFactory.createNetworkStack();
      
      expect(stack.config).toBeDefined();
      expect(stack.reconnectionStrategy).toBeDefined();
      expect(stack.poolStrategy).toBeDefined();
      expect(stack.loadBalancer).toBeDefined();
      expect(stack.metrics).toBeDefined();
    });

    it('should create network stack with custom config', () => {
      const customConfig = NetworkFactory.createHighPerformanceConfig();
      const stack = NetworkFactory.createNetworkStack(customConfig);
      
      expect(stack.config.maxConnections).toBe(1000);
    });
  });
});
