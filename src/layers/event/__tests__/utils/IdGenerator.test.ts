/**
 * IdGenerator Unit Tests
 * 
 * Comprehensive tests for IdGenerator utility.
 * Tests cover different generation strategies, batch generation, and edge cases.
 */

import { IdGenerator, IdGenerationStrategy } from '../../utils/IdGenerator';

describe('IdGenerator', () => {
  let generator: IdGenerator;

  beforeEach(() => {
    generator = new IdGenerator();
  });

  describe('constructor', () => {
    it('should create with default UUID strategy', () => {
      expect(generator).toBeDefined();
      expect(generator.getOptions().strategy).toBe('uuid');
    });

    it('should create with custom strategy', () => {
      const customGenerator = new IdGenerator({ strategy: 'nanoid' });
      expect(customGenerator.getOptions().strategy).toBe('nanoid');
    });

    it('should create with custom prefix', () => {
      const customGenerator = new IdGenerator({ prefix: 'test-' });
      expect(customGenerator.getOptions().prefix).toBe('test-');
    });

    it('should create with custom suffix', () => {
      const customGenerator = new IdGenerator({ suffix: '-test' });
      expect(customGenerator.getOptions().suffix).toBe('-test');
    });

    it('should create with custom length for nanoid', () => {
      const customGenerator = new IdGenerator({ strategy: 'nanoid', length: 10 });
      expect(customGenerator.getOptions().length).toBe(10);
    });
  });

  describe('generate', () => {
    it('should generate ID with UUID strategy', () => {
      const id = generator.generate();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should generate unique IDs with UUID', () => {
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        ids.add(generator.generate());
      }

      expect(ids.size).toBe(count);
    });

    it('should generate ID with nanoid strategy', () => {
      generator.setOptions({ strategy: 'nanoid' });
      const id = generator.generate();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should generate unique IDs with nanoid', () => {
      generator.setOptions({ strategy: 'nanoid' });
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        ids.add(generator.generate());
      }

      expect(ids.size).toBe(count);
    });

    it('should generate ID with ULID strategy', () => {
      generator.setOptions({ strategy: 'ulid' });
      const id = generator.generate();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should generate unique IDs with ULID', () => {
      generator.setOptions({ strategy: 'ulid' });
      const ids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        ids.add(generator.generate());
      }

      expect(ids.size).toBe(count);
    });

    it('should generate ID with custom strategy', () => {
      generator.setOptions({ strategy: 'custom' });
      const id = generator.generate();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should include prefix in generated ID', () => {
      generator.setOptions({ prefix: 'test-' });
      const id = generator.generate();
      expect(id).toMatch(/^test-/);
    });

    it('should include suffix in generated ID', () => {
      generator.setOptions({ suffix: '-test' });
      const id = generator.generate();
      expect(id).toMatch(/-test$/);
    });

    it('should include both prefix and suffix', () => {
      generator.setOptions({ prefix: 'pre-', suffix: '-suf' });
      const id = generator.generate();
      expect(id).toMatch(/^pre-.*-suf$/);
    });

    it('should respect custom length for nanoid', () => {
      generator.setOptions({ strategy: 'nanoid', length: 10 });
      const id = generator.generate();
      expect(id.length).toBe(10 + (generator.getOptions().prefix?.length || 0) + (generator.getOptions().suffix?.length || 0));
    });
  });

  describe('generateBatch', () => {
    it('should generate multiple IDs', () => {
      const ids = generator.generateBatch(5);
      expect(ids).toHaveLength(5);
      expect(ids.every(id => typeof id === 'string')).toBe(true);
    });

    it('should generate unique IDs in batch', () => {
      const ids = generator.generateBatch(100);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });

    it('should handle batch of 1', () => {
      const ids = generator.generateBatch(1);
      expect(ids).toHaveLength(1);
    });

    it('should handle large batch', () => {
      const ids = generator.generateBatch(10000);
      expect(ids).toHaveLength(10000);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10000);
    });

    it('should apply prefix to all IDs in batch', () => {
      generator.setOptions({ prefix: 'test-' });
      const ids = generator.generateBatch(5);
      expect(ids.every(id => id.startsWith('test-'))).toBe(true);
    });

    it('should apply suffix to all IDs in batch', () => {
      generator.setOptions({ suffix: '-test' });
      const ids = generator.generateBatch(5);
      expect(ids.every(id => id.endsWith('-test'))).toBe(true);
    });
  });

  describe('setOptions', () => {
    it('should update strategy', () => {
      generator.setOptions({ strategy: 'nanoid' });
      expect(generator.getOptions().strategy).toBe('nanoid');
    });

    it('should update prefix', () => {
      generator.setOptions({ prefix: 'new-prefix-' });
      expect(generator.getOptions().prefix).toBe('new-prefix-');
    });

    it('should update suffix', () => {
      generator.setOptions({ suffix: '-new-suffix' });
      expect(generator.getOptions().suffix).toBe('-new-suffix');
    });

    it('should update length', () => {
      generator.setOptions({ length: 15 });
      expect(generator.getOptions().length).toBe(15);
    });

    it('should update multiple options at once', () => {
      generator.setOptions({
        strategy: 'ulid',
        prefix: 'test-',
        suffix: '-end',
      });

      const options = generator.getOptions();
      expect(options.strategy).toBe('ulid');
      expect(options.prefix).toBe('test-');
      expect(options.suffix).toBe('-end');
    });

    it('should preserve existing options when updating some', () => {
      generator.setOptions({ prefix: 'test-', suffix: '-end' });
      generator.setOptions({ strategy: 'nanoid' });

      const options = generator.getOptions();
      expect(options.strategy).toBe('nanoid');
      expect(options.prefix).toBe('test-');
      expect(options.suffix).toBe('-end');
    });
  });

  describe('getOptions', () => {
    it('should return current options', () => {
      const options = generator.getOptions();
      expect(options).toBeDefined();
      expect(options.strategy).toBeDefined();
    });

    it('should return copy of options', () => {
      const options = generator.getOptions();
      options.strategy = 'modified' as any;

      expect(generator.getOptions().strategy).toBe('uuid');
    });
  });

  describe('strategy-specific behavior', () => {
    describe('UUID strategy', () => {
      it('should generate valid UUID format', () => {
        const id = generator.generate();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(id).toMatch(uuidRegex);
      });

      it('should include hyphens in UUID', () => {
        const id = generator.generate();
        expect(id).toContain('-');
      });
    });

    describe('nanoid strategy', () => {
      it('should generate alphanumeric ID', () => {
        generator.setOptions({ strategy: 'nanoid' });
        const id = generator.generate();
        expect(id).toMatch(/^[0-9a-zA-Z]+$/);
      });

      it('should not contain hyphens by default', () => {
        generator.setOptions({ strategy: 'nanoid' });
        const id = generator.generate();
        expect(id).not.toContain('-');
      });
    });

    describe('ULID strategy', () => {
      it('should generate time-ordered ID', () => {
        generator.setOptions({ strategy: 'ulid' });
        const id1 = generator.generate();
        await new Promise(resolve => setTimeout(resolve, 10));
        const id2 = generator.generate();

        expect(id2).not.toBe(id1);
      });

      it('should be URL-safe', () => {
        generator.setOptions({ strategy: 'ulid' });
        const id = generator.generate();
        expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
      });
    });

    describe('custom strategy', () => {
      it('should include timestamp in custom ID', () => {
        generator.setOptions({ strategy: 'custom' });
        const id = generator.generate();
        expect(id).toMatch(/\d+/);
      });

      it('should include counter in custom ID', () => {
        generator.setOptions({ strategy: 'custom' });
        const id1 = generator.generate();
        const id2 = generator.generate();
        expect(id1).not.toBe(id2);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty prefix', () => {
      generator.setOptions({ prefix: '' });
      const id = generator.generate();
      expect(id).toBeDefined();
    });

    it('should handle empty suffix', () => {
      generator.setOptions({ suffix: '' });
      const id = generator.generate();
      expect(id).toBeDefined();
    });

    it('should handle very long prefix', () => {
      generator.setOptions({ prefix: 'a'.repeat(100) });
      const id = generator.generate();
      expect(id).toBeDefined();
      expect(id.startsWith('a'.repeat(100))).toBe(true);
    });

    it('should handle very long suffix', () => {
      generator.setOptions({ suffix: 'a'.repeat(100) });
      const id = generator.generate();
      expect(id).toBeDefined();
      expect(id.endsWith('a'.repeat(100))).toBe(true);
    });

    it('should handle length 0 for nanoid', () => {
      generator.setOptions({ strategy: 'nanoid', length: 0 });
      const id = generator.generate();
      expect(id.length).toBeGreaterThan(0);
    });

    it('should handle very large length for nanoid', () => {
      generator.setOptions({ strategy: 'nanoid', length: 1000 });
      const id = generator.generate();
      expect(id.length).toBeGreaterThan(1000);
    });

    it('should handle switching strategies multiple times', () => {
      generator.setOptions({ strategy: 'nanoid' });
      const id1 = generator.generate();

      generator.setOptions({ strategy: 'uuid' });
      const id2 = generator.generate();

      generator.setOptions({ strategy: 'ulid' });
      const id3 = generator.generate();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id3).toBeDefined();
    });

    it('should handle concurrent generation', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              resolve(generator.generate());
            }, Math.random() * 10);
          })
        );
      }

      const ids = await Promise.all(promises) as string[];
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });
  });
});
