/**
 * Data Transformer Unit Tests
 * 
 * Tests for DataTransformer implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { DataTransformer } from '../implementations/DataTransformer';
import { TransformationRule, EnrichmentData } from '../types/data-transformation-types';

describe('DataTransformer', () => {
  let transformer: DataTransformer;

  beforeEach(() => {
    transformer = new DataTransformer();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = transformer.getConfig();

      expect(config).toBeDefined();
      expect(config.enableNormalization).toBe(true);
      expect(config.enableEnrichment).toBe(true);
      expect(config.enableMapping).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableNormalization: false,
        enableEnrichment: false,
        enableMapping: false,
      };

      transformer.setConfig(newConfig);
      const config = transformer.getConfig();

      expect(config.enableNormalization).toBe(false);
      expect(config.enableMapping).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize strings', () => {
      const data = { name: '  HELLO  ' };
      const result = transformer.normalize(data);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('hello');
    });

    it('should skip normalization when disabled', () => {
      transformer.setConfig({ enableNormalization: false, enableEnrichment: true, enableMapping: true });
      const data = { name: '  HELLO  ' };
      const result = transformer.normalize(data);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('  HELLO  ');
    });
  });

  describe('enrich', () => {
    it('should enrich data with additional fields', () => {
      const data = { id: '1' };
      const enrichment: EnrichmentData = {
        source: 'test',
        data: { timestamp: 123456 },
      };

      const result = transformer.enrich(data, enrichment);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '1', timestamp: 123456 });
    });

    it('should skip enrichment when disabled', () => {
      transformer.setConfig({ enableNormalization: true, enableEnrichment: false, enableMapping: true });
      const data = { id: '1' };
      const enrichment: EnrichmentData = {
        source: 'test',
        data: { timestamp: 123456 },
      };

      const result = transformer.enrich(data, enrichment);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '1' });
    });
  });

  describe('map', () => {
    it('should map data using rules', () => {
      const data = { firstName: 'John', lastName: 'Doe' };
      const rules: TransformationRule[] = [
        { sourceField: 'firstName', targetField: 'first_name' },
        { sourceField: 'lastName', targetField: 'last_name' },
      ];

      const result = transformer.map(data, rules);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ first_name: 'John', last_name: 'Doe' });
    });

    it('should apply transform function', () => {
      const data = { value: '123' };
      const rules: TransformationRule[] = [
        { sourceField: 'value', targetField: 'number', transform: (v) => Number(v) },
      ];

      const result = transformer.map(data, rules);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).number).toBe(123);
    });

    it('should fail when source field not found', () => {
      const data = { firstName: 'John' };
      const rules: TransformationRule[] = [
        { sourceField: 'lastName', targetField: 'last_name' },
      ];

      const result = transformer.map(data, rules);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Source field lastName not found');
    });

    it('should skip mapping when disabled', () => {
      transformer.setConfig({ enableNormalization: true, enableEnrichment: true, enableMapping: false });
      const data = { firstName: 'John' };
      const rules: TransformationRule[] = [
        { sourceField: 'firstName', targetField: 'first_name' },
      ];

      const result = transformer.map(data, rules);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });
  });

  describe('transform', () => {
    it('should apply all transformations', () => {
      const data = { name: '  HELLO  ' };
      const rules: TransformationRule[] = [
        { sourceField: 'name', targetField: 'normalized_name' },
      ];
      const enrichment: EnrichmentData = {
        source: 'test',
        data: { id: '1' },
      };

      const result = transformer.transform(data, rules, enrichment);

      expect(result.success).toBe(true);
    });
  });
});
