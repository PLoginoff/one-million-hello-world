/**
 * CanaryDeploy Unit Tests
 */

import { CanaryDeploy } from '../implementations/CanaryDeploy';

describe('CanaryDeploy', () => {
  it('should execute successfully', async () => {
    const layer = new CanaryDeploy();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new CanaryDeploy();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new CanaryDeploy();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
