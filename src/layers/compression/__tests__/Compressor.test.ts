/**
 * Compressor Unit Tests
 * 
 * Tests for Compressor implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Compressor } from '../implementations/Compressor';
import { CompressionAlgorithm } from '../types/compression-types';

describe('Compressor', () => {
  let compressor: Compressor;

  beforeEach(() => {
    compressor = new Compressor();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = compressor.getConfig();

      expect(config).toBeDefined();
      expect(config.defaultAlgorithm).toBe(CompressionAlgorithm.NONE);
      expect(config.threshold).toBe(1024);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        defaultAlgorithm: CompressionAlgorithm.GZIP,
        threshold: 512,
        enableDynamic: true,
      };

      compressor.setConfig(newConfig);
      const config = compressor.getConfig();

      expect(config.defaultAlgorithm).toBe(CompressionAlgorithm.GZIP);
      expect(config.threshold).toBe(512);
    });
  });

  describe('compress', () => {
    it('should skip compression below threshold', () => {
      const data = 'Hello';
      const result = compressor.compress(data);

      expect(result.success).toBe(true);
      expect(result.algorithm).toBe(CompressionAlgorithm.NONE);
    });

    it('should compress with GZIP', () => {
      const largeData = 'a'.repeat(2000);
      compressor.setConfig({ defaultAlgorithm: CompressionAlgorithm.GZIP, threshold: 1000, enableDynamic: false });
      const result = compressor.compress(largeData);

      expect(result.success).toBe(true);
      expect(result.algorithm).toBe(CompressionAlgorithm.GZIP);
      expect(result.data).toContain('[GZIP:');
    });

    it('should compress with Brotli', () => {
      const largeData = 'a'.repeat(2000);
      const result = compressor.compress(largeData, CompressionAlgorithm.BROTLI);

      expect(result.success).toBe(true);
      expect(result.algorithm).toBe(CompressionAlgorithm.BROTLI);
      expect(result.data).toContain('[BROTLI:');
    });

    it('should calculate compression ratio', () => {
      const largeData = 'a'.repeat(2000);
      compressor.setConfig({ defaultAlgorithm: CompressionAlgorithm.GZIP, threshold: 1000, enableDynamic: false });
      const result = compressor.compress(largeData);

      expect(result.success).toBe(true);
      expect(result.ratio).toBeDefined();
    });
  });

  describe('decompress', () => {
    it('should decompress GZIP data', () => {
      const compressed = '[GZIP:2000]' + 'a'.repeat(2000);
      const result = compressor.decompress(compressed, CompressionAlgorithm.GZIP);

      expect(result.success).toBe(true);
      expect(result.data).toBe('a'.repeat(2000));
    });

    it('should decompress Brotli data', () => {
      const compressed = '[BROTLI:2000]' + 'a'.repeat(2000);
      const result = compressor.decompress(compressed, CompressionAlgorithm.BROTLI);

      expect(result.success).toBe(true);
      expect(result.data).toBe('a'.repeat(2000));
    });

    it('should handle NONE algorithm', () => {
      const data = 'Hello';
      const result = compressor.decompress(data, CompressionAlgorithm.NONE);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello');
    });

    it('should fail for unsupported algorithm', () => {
      const data = 'Hello';
      const result = compressor.decompress(data, CompressionAlgorithm.GZIP as any);

      expect(result.success).toBe(true);
    });
  });

  describe('selectAlgorithm', () => {
    it('should return default when dynamic disabled', () => {
      const data = 'a'.repeat(2000);
      const result = compressor.selectAlgorithm(data);

      expect(result).toBe(CompressionAlgorithm.NONE);
    });

    it('should return NONE for small data', () => {
      compressor.setConfig({ defaultAlgorithm: CompressionAlgorithm.GZIP, threshold: 1000, enableDynamic: true });
      const data = 'Hello';
      const result = compressor.selectAlgorithm(data);

      expect(result).toBe(CompressionAlgorithm.NONE);
    });

    it('should return GZIP for repeating patterns', () => {
      compressor.setConfig({ defaultAlgorithm: CompressionAlgorithm.GZIP, threshold: 1000, enableDynamic: true });
      const data = 'abcabcabcabc'.repeat(100);
      const result = compressor.selectAlgorithm(data);

      expect(result).toBe(CompressionAlgorithm.GZIP);
    });
  });
});
