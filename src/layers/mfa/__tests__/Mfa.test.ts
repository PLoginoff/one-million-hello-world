/**
 * Mfa Unit Tests
 */

import { Mfa } from '../implementations/Mfa';

describe('Mfa', () => {
  it('should execute successfully', async () => {
    const layer = new Mfa();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Mfa();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Mfa();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
