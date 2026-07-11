/**
 * ChaosEngineering Unit Tests
 */

import { ChaosEngineering } from '../implementations/ChaosEngineering';

describe('ChaosEngineering', () => {
  it('should execute successfully', async () => {
    const layer = new ChaosEngineering();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new ChaosEngineering();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new ChaosEngineering();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
