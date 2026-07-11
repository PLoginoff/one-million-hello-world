/**
 * DdosProtection Unit Tests
 */

import { DdosProtection } from '../implementations/DdosProtection';

describe('DdosProtection', () => {
  it('should execute successfully', async () => {
    const layer = new DdosProtection();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new DdosProtection();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new DdosProtection();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
