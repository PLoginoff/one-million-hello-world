/**
 * Strategy tests for JwtValidation layer
 */

import { JwtValidationContext } from '../types/jwt-validation-types';
import { JwtValidationDefaultStrategy } from '../strategies/DefaultStrategy';
import { JwtValidationFastStrategy } from '../strategies/FastStrategy';
import { JwtValidationReliableStrategy } from '../strategies/ReliableStrategy';
import { JwtValidationCachedStrategy } from '../strategies/CachedStrategy';
import { JwtValidationBatchStrategy } from '../strategies/BatchStrategy';
import { JwtValidationStrategyFactory } from '../factories/JwtValidationStrategyFactory';

function createContext(input: unknown): JwtValidationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('JwtValidation Strategies', () => {
  const strategies = [
    { name: 'default', cls: JwtValidationDefaultStrategy },
    { name: 'fast', cls: JwtValidationFastStrategy },
    { name: 'reliable', cls: JwtValidationReliableStrategy },
    { name: 'cached', cls: JwtValidationCachedStrategy },
    { name: 'batch', cls: JwtValidationBatchStrategy },
  ];

  strategies.forEach((s) => {
    describe(s.name + ' strategy', () => {
      it('should have correct name', () => {
        const strategy = new s.cls();
        expect(strategy.name).toBe(s.name);
      });

      it('should have positive priority', () => {
        const strategy = new s.cls();
        expect(strategy.priority).toBeGreaterThanOrEqual(0);
      });

      it('should execute successfully', async () => {
        const strategy = new s.cls();
        const result = await strategy.execute(createContext('test'));
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = new s.cls();
        await strategy.execute(createContext(1));
        await strategy.execute(createContext(2));
        await strategy.execute(createContext(3));
        expect(strategy.getExecutionCount()).toBe(3);
      });
    });
  });

  describe('JwtValidationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new JwtValidationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new JwtValidationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new JwtValidationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new JwtValidationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new JwtValidationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
