/**
 * Content Negotiation Manager Unit Tests
 */

import { ContentNegotiationManager } from '../../content-negotiation/ContentNegotiationManager';
import { ContentType } from '../../types/serialization-types';

describe('ContentNegotiationManager', () => {
  let manager: ContentNegotiationManager;

  beforeEach(() => {
    manager = new ContentNegotiationManager();
  });

  describe('negotiate', () => {
    it('should negotiate JSON from application/json', () => {
      const result = manager.negotiate('application/json');
      expect(result).toBe(ContentType.JSON);
    });

    it('should negotiate JSON from text/json', () => {
      const result = manager.negotiate('text/json');
      expect(result).toBe(ContentType.JSON);
    });

    it('should negotiate JSON from */*', () => {
      const result = manager.negotiate('*/*');
      expect(result).toBe(ContentType.JSON);
    });

    it('should negotiate XML from application/xml', () => {
      const result = manager.negotiate('application/xml');
      expect(result).toBe(ContentType.XML);
    });

    it('should negotiate XML from text/xml', () => {
      const result = manager.negotiate('text/xml');
      expect(result).toBe(ContentType.XML);
    });

    it('should negotiate HTML from text/html', () => {
      const result = manager.negotiate('text/html');
      expect(result).toBe(ContentType.HTML);
    });

    it('should negotiate plain text from text/plain', () => {
      const result = manager.negotiate('text/plain');
      expect(result).toBe(ContentType.PLAIN_TEXT);
    });

    it('should respect q-values - higher q-value wins', () => {
      const result = manager.negotiate('application/xml;q=0.9, application/json;q=1.0');
      expect(result).toBe(ContentType.JSON);
    });

    it('should respect q-values - lower q-value loses', () => {
      const result = manager.negotiate('application/json;q=0.5, application/xml;q=0.9');
      expect(result).toBe(ContentType.XML);
    });

    it('should handle multiple accept types', () => {
      const result = manager.negotiate('text/html, application/json, text/plain');
      expect(result).toBe(ContentType.HTML);
    });

    it('should default to JSON for unknown types', () => {
      const result = manager.negotiate('application/unknown');
      expect(result).toBe(ContentType.JSON);
    });

    it('should handle empty accept header', () => {
      const result = manager.negotiate('');
      expect(result).toBe(ContentType.JSON);
    });

    it('should handle whitespace in accept header', () => {
      const result = manager.negotiate('  application/json  ');
      expect(result).toBe(ContentType.JSON);
    });

    it('should handle complex accept header with quality values', () => {
      const result = manager.negotiate('text/html;q=0.8, application/json;q=1.0, text/plain;q=0.5');
      expect(result).toBe(ContentType.JSON);
    });
  });

  describe('addNegotiator', () => {
    it('should add custom negotiator', () => {
      const customNegotiator = {
        negotiate: jest.fn(() => ContentType.JSON),
        getSupportedContentTypes: jest.fn(() => [ContentType.JSON]),
        getPriority: jest.fn(() => 50),
        setNext: jest.fn(),
      };

      manager.addNegotiator(customNegotiator as any);
      const result = manager.negotiate('application/json');
      expect(result).toBe(ContentType.JSON);
    });
  });

  describe('resetChain', () => {
    it('should reset to default negotiators', () => {
      manager.resetChain();
      const result = manager.negotiate('application/json');
      expect(result).toBe(ContentType.JSON);
    });
  });
});
