/**
 * PolicyEngine Unit Tests
 */

import { PolicyEngine } from '../implementations/PolicyEngine';

describe('PolicyEngine', () => {
  it('should execute successfully', async () => {
    const layer = new PolicyEngine();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new PolicyEngine();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new PolicyEngine();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
