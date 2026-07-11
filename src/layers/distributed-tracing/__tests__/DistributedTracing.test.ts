/**
 * DistributedTracing Unit Tests
 */

import { DistributedTracing } from '../implementations/DistributedTracing';

describe('DistributedTracing', () => {
  it('should execute successfully', async () => {
    const layer = new DistributedTracing();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new DistributedTracing();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new DistributedTracing();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
