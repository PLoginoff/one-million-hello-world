/**
 * Configuration Unit Tests
 */

import { Configuration } from '../implementations/Configuration';

describe('Configuration', () => {
  it('should execute successfully', async () => {
    const layer = new Configuration();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Configuration();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Configuration();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
