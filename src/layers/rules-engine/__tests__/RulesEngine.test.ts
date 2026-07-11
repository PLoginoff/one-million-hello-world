/**
 * RulesEngine Unit Tests
 */

import { RulesEngine } from '../implementations/RulesEngine';

describe('RulesEngine', () => {
  it('should execute successfully', async () => {
    const layer = new RulesEngine();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new RulesEngine();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new RulesEngine();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
