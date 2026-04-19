/**
 * Serialization Strategy Factory Tests
 */

import { SerializationStrategyFactory } from '../../factories/SerializationStrategyFactory';
import { JSONStrategy } from '../../strategies/JSONStrategy';
import { XMLStrategy } from '../../strategies/XMLStrategy';
import { StringStrategy } from '../../strategies/StringStrategy';

describe('SerializationStrategyFactory', () => {
  let factory: SerializationStrategyFactory;

  beforeEach(() => {
    factory = new SerializationStrategyFactory();
  });

  describe('Strategy Creation', () => {
    it('should create JSON strategy', () => {
      const strategy = factory.createStrategy('json');
      expect(strategy).toBeInstanceOf(JSONStrategy);
    });

    it('should create XML strategy', () => {
      const strategy = factory.createStrategy('xml');
      expect(strategy).toBeInstanceOf(XMLStrategy);
    });

    it('should create String strategy', () => {
      const strategy = factory.createStrategy('string');
      expect(strategy).toBeInstanceOf(StringStrategy);
    });

    it('should throw for unknown strategy', () => {
      expect(() => factory.createStrategy('unknown')).toThrow();
    });
  });

  describe('Strategy Registration', () => {
    it('should register custom strategy', () => {
      const customStrategy = new JSONStrategy();
      factory.registerStrategy('custom', () => customStrategy);
      const strategy = factory.createStrategy('custom');
      expect(strategy).toBe(customStrategy);
    });

    it('should check if strategy is registered', () => {
      expect(factory.hasStrategy('json')).toBe(true);
      expect(factory.hasStrategy('unknown')).toBe(false);
    });

    it('should unregister strategy', () => {
      factory.unregisterStrategy('json');
      expect(factory.hasStrategy('json')).toBe(false);
    });
  });

  describe('Available Strategies', () => {
    it('should return list of available strategies', () => {
      const strategies = factory.getAvailableStrategies();
      expect(strategies).toContain('json');
      expect(strategies).toContain('xml');
      expect(strategies).toContain('string');
    });
  });
});
