/**
 * Network Types Unit Tests
 * 
 * Tests for Network Layer type definitions and enums.
 * Validates type safety and enum values.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import {
  ConnectionState,
  ConnectionPriority,
  ConnectionType,
  NetworkEventType,
} from '../types/network-types';

describe('Network Types', () => {
  describe('ConnectionState', () => {
    it('should have DISCONNECTED state', () => {
      expect(ConnectionState.DISCONNECTED).toBe('DISCONNECTED');
    });

    it('should have CONNECTING state', () => {
      expect(ConnectionState.CONNECTING).toBe('CONNECTING');
    });

    it('should have CONNECTED state', () => {
      expect(ConnectionState.CONNECTED).toBe('CONNECTED');
    });

    it('should have CLOSING state', () => {
      expect(ConnectionState.CLOSING).toBe('CLOSING');
    });

    it('should have ERROR state', () => {
      expect(ConnectionState.ERROR).toBe('ERROR');
    });

    it('should have RECONNECTING state', () => {
      expect(ConnectionState.RECONNECTING).toBe('RECONNECTING');
    });

    it('should have PAUSED state', () => {
      expect(ConnectionState.PAUSED).toBe('PAUSED');
    });

    it('should have TIMEOUT state', () => {
      expect(ConnectionState.TIMEOUT).toBe('TIMEOUT');
    });
  });

  describe('ConnectionPriority', () => {
    it('should have LOW priority', () => {
      expect(ConnectionPriority.LOW).toBe(0);
    });

    it('should have NORMAL priority', () => {
      expect(ConnectionPriority.NORMAL).toBe(1);
    });

    it('should have HIGH priority', () => {
      expect(ConnectionPriority.HIGH).toBe(2);
    });

    it('should have CRITICAL priority', () => {
      expect(ConnectionPriority.CRITICAL).toBe(3);
    });
  });

  describe('ConnectionType', () => {
    it('should have TCP type', () => {
      expect(ConnectionType.TCP).toBe('TCP');
    });

    it('should have UDP type', () => {
      expect(ConnectionType.UDP).toBe('UDP');
    });

    it('should have TLS type', () => {
      expect(ConnectionType.TLS).toBe('TLS');
    });

    it('should have WEBSOCKET type', () => {
      expect(ConnectionType.WEBSOCKET).toBe('WEBSOCKET');
    });
  });

  describe('NetworkEventType', () => {
    it('should have CONNECTION_OPENED event', () => {
      expect(NetworkEventType.CONNECTION_OPENED).toBe('CONNECTION_OPENED');
    });

    it('should have CONNECTION_CLOSED event', () => {
      expect(NetworkEventType.CONNECTION_CLOSED).toBe('CONNECTION_CLOSED');
    });

    it('should have DATA_RECEIVED event', () => {
      expect(NetworkEventType.DATA_RECEIVED).toBe('DATA_RECEIVED');
    });

    it('should have DATA_SENT event', () => {
      expect(NetworkEventType.DATA_SENT).toBe('DATA_SENT');
    });

    it('should have ERROR event', () => {
      expect(NetworkEventType.ERROR).toBe('ERROR');
    });
  });
});
