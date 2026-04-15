/**
 * Transport Unit Tests
 * 
 * Tests for Transport implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Transport } from '../implementations/Transport';

describe('Transport', () => {
  let transport: Transport;

  beforeEach(() => {
    transport = new Transport();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = transport.getConfig();

      expect(config).toBeDefined();
      expect(config.enableStreaming).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableStreaming: true,
        enableChunkedEncoding: true,
      };

      transport.setConfig(newConfig);
      const config = transport.getConfig();

      expect(config.enableStreaming).toBe(true);
    });
  });

  describe('send', () => {
    it('should send data with default status', async () => {
      const result = await transport.send('Hello World');

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello World');
      expect(result.status).toBe(200);
    });

    it('should send data with custom status', async () => {
      const result = await transport.send('Hello World', 201);

      expect(result.success).toBe(true);
      expect(result.status).toBe(201);
    });

    it('should apply chunked encoding when enabled', async () => {
      transport.setConfig({ enableStreaming: false, enableChunkedEncoding: true });
      const data = 'a'.repeat(2000);
      const result = await transport.send(data);

      expect(result.success).toBe(true);
      expect(result.data).toContain('\r\n');
    });
  });
});
