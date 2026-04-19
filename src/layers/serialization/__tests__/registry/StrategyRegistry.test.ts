/**
 * Strategy Registry Tests
 */

import { StrategyRegistry } from '../../registry/StrategyRegistry';
import { JSONStrategy } from '../../strategies/JSONStrategy';

describe('StrategyRegistry', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
  });

  describe('Registration', () => {
    it('should register strategy', () => {
      const strategy = new JSONStrategy();
      registry.register('json', strategy, { description: 'JSON format' });
      expect(registry.has('json')).toBe(true);
    });

    it('should unregister strategy', () => {
      const strategy = new JSONStrategy();
      registry.register('json', strategy);
      registry.unregister('json');
      expect(registry.has('json')).toBe(false);
    });

    it('should get strategy', () => {
      const strategy = new JSONStrategy();
      registry.register('json', strategy);
      const retrieved = registry.get('json');
      expect(retrieved).toBe(strategy);
    });

    it('should return undefined for non-existent strategy', () => {
      const retrieved = registry.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    it('should store and retrieve metadata', () => {
      const strategy = new JSONStrategy();
      registry.register('json', strategy, { description: 'JSON format', version: '1.0' });
      const metadata = registry.getMetadata('json');
      expect(metadata).toHaveProperty('description', 'JSON format');
      expect(metadata).toHaveProperty('version', '1.0');
    });

    it('should update metadata', () => {
      const strategy = new JSONStrategy();
      registry.register('json', strategy, { description: 'JSON' });
      registry.updateMetadata('json', { description: 'JSON format' });
      const metadata = registry.getMetadata('json');
      expect(metadata?.description).toBe('JSON format');
    });
  });

  describe('Listing', () => {
    it('should return all registered names', () => {
      registry.register('json', new JSONStrategy());
      registry.register('xml', new JSONStrategy());
      const names = registry.list();
      expect(names).toContain('json');
      expect(names).toContain('xml');
    });

    it('should return all strategies', () => {
      const jsonStrategy = new JSONStrategy();
      const xmlStrategy = new JSONStrategy();
      registry.register('json', jsonStrategy);
      registry.register('xml', xmlStrategy);
      const strategies = registry.getAll();
      expect(strategies.size).toBe(2);
    });
  });

  describe('Clear', () => {
    it('should clear all strategies', () => {
      registry.register('json', new JSONStrategy());
      registry.register('xml', new JSONStrategy());
      registry.clear();
      expect(registry.list()).toHaveLength(0);
    });
  });
});
