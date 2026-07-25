/**
 * Strategy tests for Serialization layer
 */

import { SerializationDefaultStrategy } from '../strategies/DefaultStrategy';
import { SerializationFastStrategy } from '../strategies/FastStrategy';
import { SerializationReliableStrategy } from '../strategies/ReliableStrategy';
import { SerializationCachedStrategy } from '../strategies/CachedStrategy';
import { SerializationBatchStrategy } from '../strategies/BatchStrategy';

describe('Serialization Strategies', () => {
  const strategies = [
    { name: 'default', cls: SerializationDefaultStrategy },
    { name: 'fast', cls: SerializationFastStrategy },
    { name: 'reliable', cls: SerializationReliableStrategy },
    { name: 'cached', cls: SerializationCachedStrategy },
    { name: 'batch', cls: SerializationBatchStrategy },
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
        const result = await strategy.execute('test');
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = new s.cls();
        await strategy.execute(1);
        await strategy.execute(2);
        await strategy.execute(3);
        expect(strategy.getExecutionCount()).toBe(3);
      });
    });
  });
});
