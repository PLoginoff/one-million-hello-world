/**
 * Network Endpoint Entity Tests
 * 
 * Unit tests for NetworkEndpoint using AAA pattern.
 */

import { NetworkEndpoint } from '../entities/NetworkEndpoint';

describe('NetworkEndpoint', () => {
  describe('create', () => {
    it('should create a new endpoint', () => {
      const endpoint = NetworkEndpoint.create('localhost', 3000);
      
      expect(endpoint).toBeDefined();
      expect(endpoint.host).toBe('localhost');
      expect(endpoint.port).toBe(3000);
      expect(endpoint.protocol).toBe('tcp');
      expect(endpoint.isSecure()).toBe(false);
    });

    it('should throw error for empty host', () => {
      expect(() => NetworkEndpoint.create('', 3000)).toThrow('Host cannot be empty');
    });

    it('should throw error for invalid port', () => {
      expect(() => NetworkEndpoint.create('localhost', -1)).toThrow('Port must be between 0 and 65535');
      expect(() => NetworkEndpoint.create('localhost', 70000)).toThrow('Port must be between 0 and 65535');
    });
  });

  describe('createSecure', () => {
    it('should create a secure endpoint', () => {
      const endpoint = NetworkEndpoint.createSecure('localhost', 443);
      
      expect(endpoint.isSecure()).toBe(true);
      expect(endpoint.protocol).toBe('tls');
    });
  });

  describe('fromAddress', () => {
    it('should create endpoint from address string', () => {
      const endpoint = NetworkEndpoint.fromAddress('localhost:3000');
      
      expect(endpoint.host).toBe('localhost');
      expect(endpoint.port).toBe(3000);
    });

    it('should use default port if not specified', () => {
      const endpoint = NetworkEndpoint.fromAddress('localhost');
      
      expect(endpoint.port).toBe(80);
    });
  });

  describe('fromUrl', () => {
    it('should create endpoint from HTTP URL', () => {
      const endpoint = NetworkEndpoint.fromUrl('http://example.com:8080');
      
      expect(endpoint.host).toBe('example.com');
      expect(endpoint.port).toBe(8080);
      expect(endpoint.isSecure()).toBe(false);
    });

    it('should create secure endpoint from HTTPS URL', () => {
      const endpoint = NetworkEndpoint.fromUrl('https://example.com');
      
      expect(endpoint.host).toBe('example.com');
      expect(endpoint.port).toBe(443);
      expect(endpoint.isSecure()).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for equal endpoints', () => {
      const endpoint1 = NetworkEndpoint.create('localhost', 3000);
      const endpoint2 = NetworkEndpoint.create('localhost', 3000);
      
      expect(endpoint1.equals(endpoint2)).toBe(true);
    });

    it('should return false for different endpoints', () => {
      const endpoint1 = NetworkEndpoint.create('localhost', 3000);
      const endpoint2 = NetworkEndpoint.create('localhost', 3001);
      
      expect(endpoint1.equals(endpoint2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return host:port string', () => {
      const endpoint = NetworkEndpoint.create('localhost', 3000);
      
      expect(endpoint.toString()).toBe('localhost:3000');
    });
  });

  describe('getFullAddress', () => {
    it('should return full address with protocol', () => {
      const endpoint = NetworkEndpoint.create('localhost', 3000);
      
      expect(endpoint.getFullAddress()).toBe('tcp://localhost:3000');
    });
  });

  describe('isLocalhost', () => {
    it('should return true for localhost', () => {
      const endpoint = NetworkEndpoint.create('localhost', 3000);
      
      expect(endpoint.isLocalhost()).toBe(true);
    });

    it('should return true for 127.0.0.1', () => {
      const endpoint = NetworkEndpoint.create('127.0.0.1', 3000);
      
      expect(endpoint.isLocalhost()).toBe(true);
    });

    it('should return false for remote host', () => {
      const endpoint = NetworkEndpoint.create('example.com', 3000);
      
      expect(endpoint.isLocalhost()).toBe(false);
    });
  });

  describe('withPort', () => {
    it('should create copy with different port', () => {
      const endpoint = NetworkEndpoint.create('localhost', 3000);
      const newEndpoint = endpoint.withPort(8080);
      
      expect(newEndpoint.port).toBe(8080);
      expect(newEndpoint.host).toBe('localhost');
      expect(endpoint.port).toBe(3000);
    });
  });

  describe('withHost', () => {
    it('should create copy with different host', () => {
      const endpoint = NetworkEndpoint.create('localhost', 3000);
      const newEndpoint = endpoint.withHost('example.com');
      
      expect(newEndpoint.host).toBe('example.com');
      expect(newEndpoint.port).toBe(3000);
      expect(endpoint.host).toBe('localhost');
    });
  });
});
