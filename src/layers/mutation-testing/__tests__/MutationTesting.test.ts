/**
 * MutationTesting Unit Tests
 */

import { MutationTesting } from '../implementations/MutationTesting';

describe('MutationTesting', () => {
  it('should execute successfully', async () => {
    const layer = new MutationTesting();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new MutationTesting();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new MutationTesting();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
