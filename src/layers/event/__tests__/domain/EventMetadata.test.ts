/**
 * EventMetadata Unit Tests
 * 
 * Comprehensive tests for EventMetadata value object.
 * Tests cover validation, correlation, causation, tags, and edge cases.
 */

import { EventMetadata, EventMetadataOptions } from '../../domain/value-objects/EventMetadata';

describe('EventMetadata', () => {
  describe('constructor', () => {
    it('should create metadata with default values', () => {
      const metadata = new EventMetadata();
      expect(metadata.timestamp).toBeInstanceOf(Date);
      expect(metadata.source).toBe('unknown');
      expect(metadata.correlationId).toBeDefined();
      expect(metadata.version).toBe(1);
      expect(metadata.tags).toEqual({});
    });

    it('should create metadata with custom values', () => {
      const timestamp = new Date('2024-01-01');
      const options: EventMetadataOptions = {
        timestamp,
        source: 'test-source',
        correlationId: 'test-correlation',
        userId: 'user-123',
        version: 2,
        tags: { key1: 'value1' },
      };

      const metadata = new EventMetadata(options);
      expect(metadata.timestamp).toEqual(timestamp);
      expect(metadata.source).toBe('test-source');
      expect(metadata.correlationId).toBe('test-correlation');
      expect(metadata.userId).toBe('user-123');
      expect(metadata.version).toBe(2);
      expect(metadata.tags).toEqual({ key1: 'value1' });
    });

    it('should generate correlation ID if not provided', () => {
      const metadata = new EventMetadata({ source: 'test' });
      expect(metadata.correlationId).toBeDefined();
      expect(metadata.correlationId.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid timestamp', () => {
      expect(() => new EventMetadata({ timestamp: new Date('invalid') as any })).toThrow(
        'EventMetadata: timestamp must be a valid Date'
      );
    });

    it('should throw error for empty source', () => {
      expect(() => new EventMetadata({ source: '' })).toThrow(
        'EventMetadata: source must be a non-empty string'
      );
    });

    it('should throw error for undefined source', () => {
      expect(() => new EventMetadata({ source: undefined as any })).toThrow(
        'EventMetadata: source must be a non-empty string'
      );
    });

    it('should throw error for empty correlation ID', () => {
      expect(() => new EventMetadata({ correlationId: '' })).toThrow(
        'EventMetadata: correlationId must be a non-empty string'
      );
    });

    it('should throw error for version less than 1', () => {
      expect(() => new EventMetadata({ version: 0 })).toThrow(
        'EventMetadata: version must be at least 1'
      );
    });

    it('should throw error for negative version', () => {
      expect(() => new EventMetadata({ version: -1 })).toThrow(
        'EventMetadata: version must be at least 1'
      );
    });
  });

  describe('timestamp', () => {
    it('should return a copy of timestamp', () => {
      const timestamp = new Date('2024-01-01');
      const metadata = new EventMetadata({ timestamp });
      const returnedTimestamp = metadata.timestamp;
      
      returnedTimestamp.setFullYear(2025);
      
      expect(metadata.timestamp.getFullYear()).toBe(2024);
    });
  });

  describe('source', () => {
    it('should return the source', () => {
      const metadata = new EventMetadata({ source: 'test-source' });
      expect(metadata.source).toBe('test-source');
    });
  });

  describe('correlationId', () => {
    it('should return the correlation ID', () => {
      const metadata = new EventMetadata({ correlationId: 'test-id' });
      expect(metadata.correlationId).toBe('test-id');
    });

    it('should generate unique correlation IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const metadata = new EventMetadata();
        ids.add(metadata.correlationId);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('causationId', () => {
    it('should return causation ID if set', () => {
      const metadata = new EventMetadata({ causationId: 'cause-id' });
      expect(metadata.causationId).toBe('cause-id');
    });

    it('should return undefined if not set', () => {
      const metadata = new EventMetadata();
      expect(metadata.causationId).toBeUndefined();
    });
  });

  describe('userId', () => {
    it('should return user ID if set', () => {
      const metadata = new EventMetadata({ userId: 'user-123' });
      expect(metadata.userId).toBe('user-123');
    });

    it('should return undefined if not set', () => {
      const metadata = new EventMetadata();
      expect(metadata.userId).toBeUndefined();
    });
  });

  describe('version', () => {
    it('should return the version', () => {
      const metadata = new EventMetadata({ version: 5 });
      expect(metadata.version).toBe(5);
    });
  });

  describe('tags', () => {
    it('should return a copy of tags', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1' } });
      const tags = metadata.tags;
      tags.key2 = 'value2';
      
      expect(metadata.tags).toEqual({ key1: 'value1' });
    });

    it('should return empty object if no tags', () => {
      const metadata = new EventMetadata();
      expect(metadata.tags).toEqual({});
    });
  });

  describe('getTag', () => {
    it('should return tag value if exists', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1' } });
      expect(metadata.getTag('key1')).toBe('value1');
    });

    it('should return undefined if tag does not exist', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1' } });
      expect(metadata.getTag('key2')).toBeUndefined();
    });
  });

  describe('hasTag', () => {
    it('should return true if tag exists', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1' } });
      expect(metadata.hasTag('key1')).toBe(true);
    });

    it('should return false if tag does not exist', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1' } });
      expect(metadata.hasTag('key2')).toBe(false);
    });
  });

  describe('withCausationId', () => {
    it('should create new metadata with causation ID', () => {
      const metadata = new EventMetadata({ source: 'test' });
      const newMetadata = metadata.withCausationId('cause-id');
      
      expect(newMetadata.causationId).toBe('cause-id');
      expect(metadata.causationId).toBeUndefined();
    });

    it('should preserve other properties', () => {
      const metadata = new EventMetadata({
        source: 'test',
        correlationId: 'corr-id',
        userId: 'user-123',
      });
      const newMetadata = metadata.withCausationId('cause-id');
      
      expect(newMetadata.source).toBe('test');
      expect(newMetadata.correlationId).toBe('corr-id');
      expect(newMetadata.userId).toBe('user-123');
    });
  });

  describe('withTag', () => {
    it('should add new tag', () => {
      const metadata = new EventMetadata({ source: 'test' });
      const newMetadata = metadata.withTag('key1', 'value1');
      
      expect(newMetadata.hasTag('key1')).toBe(true);
      expect(newMetadata.getTag('key1')).toBe('value1');
    });

    it('should update existing tag', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1' } });
      const newMetadata = metadata.withTag('key1', 'value2');
      
      expect(newMetadata.getTag('key1')).toBe('value2');
    });

    it('should preserve other tags', () => {
      const metadata = new EventMetadata({ tags: { key1: 'value1', key2: 'value2' } });
      const newMetadata = metadata.withTag('key1', 'new-value');
      
      expect(newMetadata.getTag('key2')).toBe('value2');
    });
  });

  describe('equals', () => {
    it('should return true for equal metadata', () => {
      const timestamp = new Date('2024-01-01');
      const options: EventMetadataOptions = {
        timestamp,
        source: 'test',
        correlationId: 'corr-id',
      };
      
      const metadata1 = new EventMetadata(options);
      const metadata2 = new EventMetadata(options);
      
      expect(metadata1.equals(metadata2)).toBe(true);
    });

    it('should return false for different source', () => {
      const metadata1 = new EventMetadata({ source: 'source1' });
      const metadata2 = new EventMetadata({ source: 'source2' });
      
      expect(metadata1.equals(metadata2)).toBe(false);
    });

    it('should return false for different correlation ID', () => {
      const metadata1 = new EventMetadata({ correlationId: 'id1' });
      const metadata2 = new EventMetadata({ correlationId: 'id2' });
      
      expect(metadata1.equals(metadata2)).toBe(false);
    });

    it('should return false for non-EventMetadata objects', () => {
      const metadata = new EventMetadata();
      expect(metadata.equals({} as any)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const timestamp = new Date('2024-01-01T00:00:00Z');
      const metadata = new EventMetadata({
        timestamp,
        source: 'test',
        correlationId: 'corr-id',
        userId: 'user-123',
        version: 2,
        tags: { key1: 'value1' },
      });
      
      const json = metadata.toJSON();
      
      expect(json.timestamp).toBe(timestamp.toISOString());
      expect(json.source).toBe('test');
      expect(json.correlationId).toBe('corr-id');
      expect(json.userId).toBe('user-123');
      expect(json.version).toBe(2);
      expect(json.tags).toEqual({ key1: 'value1' });
    });
  });

  describe('fromJSON', () => {
    it('should create from JSON', () => {
      const json = {
        timestamp: '2024-01-01T00:00:00Z',
        source: 'test',
        correlationId: 'corr-id',
        userId: 'user-123',
        version: 2,
        tags: { key1: 'value1' },
      };
      
      const metadata = EventMetadata.fromJSON(json);
      
      expect(metadata.source).toBe('test');
      expect(metadata.correlationId).toBe('corr-id');
      expect(metadata.userId).toBe('user-123');
      expect(metadata.version).toBe(2);
      expect(metadata.tags).toEqual({ key1: 'value1' });
    });

    it('should handle missing optional fields', () => {
      const json = {
        source: 'test',
        correlationId: 'corr-id',
      };
      
      const metadata = EventMetadata.fromJSON(json);
      
      expect(metadata.source).toBe('test');
      expect(metadata.correlationId).toBe('corr-id');
      expect(metadata.userId).toBeUndefined();
      expect(metadata.version).toBe(1);
      expect(metadata.tags).toEqual({});
    });
  });

  describe('create', () => {
    it('should create metadata with source', () => {
      const metadata = EventMetadata.create('test-source');
      expect(metadata.source).toBe('test-source');
      expect(metadata.timestamp).toBeInstanceOf(Date);
      expect(metadata.correlationId).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle tags with special characters', () => {
      const metadata = new EventMetadata({
        tags: { 'key-with-dash': 'value', 'key_with_underscore': 'value2' },
      });
      expect(metadata.hasTag('key-with-dash')).toBe(true);
      expect(metadata.hasTag('key_with_underscore')).toBe(true);
    });

    it('should handle very long correlation ID', () => {
      const longId = 'a'.repeat(1000);
      const metadata = new EventMetadata({ correlationId: longId });
      expect(metadata.correlationId).toBe(longId);
    });

    it('should handle very large version', () => {
      const metadata = new EventMetadata({ version: 1000000 });
      expect(metadata.version).toBe(1000000);
    });
  });
});
