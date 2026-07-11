/**
 * Throttling Unit Tests
 */

import { Throttling } from '../implementations/Throttling';

describe('Throttling', () => {
  it('should execute successfully', async () => {
    const layer = new Throttling();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Throttling();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Throttling();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
