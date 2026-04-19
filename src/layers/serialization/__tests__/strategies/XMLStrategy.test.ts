/**
 * XML Strategy Unit Tests
 */

import { XMLStrategy } from '../../strategies/XMLStrategy';
import { ContentType } from '../../types/serialization-types';

describe('XMLStrategy', () => {
  let strategy: XMLStrategy;

  beforeEach(() => {
    strategy = new XMLStrategy();
  });

  describe('serialize', () => {
    it('should serialize object to XML', () => {
      const data = { message: 'Hello', value: '42' };
      const result = strategy.serialize(data);

      expect(result).toContain('<root>');
      expect(result).toContain('<message>Hello</message>');
      expect(result).toContain('<value>42</value>');
      expect(result).toContain('</root>');
    });

    it('should serialize null to XML', () => {
      const data = null;
      const result = strategy.serialize(data);

      expect(result).toBe('<root />');
    });

    it('should serialize undefined to XML', () => {
      const data = undefined;
      const result = strategy.serialize(data);

      expect(result).toBe('<root />');
    });

    it('should serialize string to XML', () => {
      const data = 'Hello';
      const result = strategy.serialize(data);

      expect(result).toBe('<root>Hello</root>');
    });

    it('should serialize number to XML', () => {
      const data = 42;
      const result = strategy.serialize(data);

      expect(result).toBe('<root>42</root>');
    });

    it('should serialize boolean to XML', () => {
      const data = true;
      const result = strategy.serialize(data);

      expect(result).toBe('<root>true</root>');
    });

    it('should escape XML special characters', () => {
      const data = { message: '<script>alert("xss")</script>' };
      const result = strategy.serialize(data);

      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&quot;xss&quot;');
    });

    it('should serialize nested objects', () => {
      const data = { user: { name: 'John', age: '30' } };
      const result = strategy.serialize(data);

      expect(result).toContain('<user>');
      expect(result).toContain('<name>John</name>');
      expect(result).toContain('<age>30</age>');
      expect(result).toContain('</user>');
    });
  });

  describe('deserialize', () => {
    it('should deserialize XML to object', () => {
      const data = '<root><message>Hello</message><value>42</value></root>';
      const result = strategy.deserialize(data);

      expect(result).toEqual({ message: 'Hello', value: '42' });
    });

    it('should deserialize simple XML', () => {
      const data = '<root>Hello</root>';
      const result = strategy.deserialize(data);

      expect(result).toEqual({ root: 'Hello' });
    });

    it('should handle empty XML', () => {
      const data = '<root></root>';
      const result = strategy.deserialize(data);

      expect(result).toEqual({});
    });

    it('should unescape XML special characters', () => {
      const data = '<root><message>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</message></root>';
      const result = strategy.deserialize(data);

      expect(result).toEqual({ message: '<script>alert("xss")</script>' });
    });
  });

  describe('getContentType', () => {
    it('should return XML content type', () => {
      expect(strategy.getContentType()).toBe(ContentType.XML);
    });
  });

  describe('getFormatName', () => {
    it('should return format name', () => {
      expect(strategy.getFormatName()).toBe('xml');
    });
  });

  describe('canSerialize', () => {
    it('should return true for objects', () => {
      expect(strategy.canSerialize({})).toBe(true);
      expect(strategy.canSerialize({ key: 'value' })).toBe(true);
    });

    it('should return true for primitives', () => {
      expect(strategy.canSerialize('')).toBe(true);
      expect(strategy.canSerialize(42)).toBe(true);
      expect(strategy.canSerialize(true)).toBe(true);
      expect(strategy.canSerialize(null)).toBe(true);
    });
  });

  describe('canDeserialize', () => {
    it('should return true for valid XML', () => {
      expect(strategy.canDeserialize('<root></root>')).toBe(true);
      expect(strategy.canDeserialize('<root>data</root>')).toBe(true);
      expect(strategy.canDeserialize('<tag>value</tag>')).toBe(true);
    });

    it('should return false for non-XML', () => {
      expect(strategy.canDeserialize('not xml')).toBe(false);
      expect(strategy.canDeserialize('{}')).toBe(false);
      expect(strategy.canDeserialize('[]')).toBe(false);
    });
  });
});
