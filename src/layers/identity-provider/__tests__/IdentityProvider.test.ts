/**
 * IdentityProvider Unit Tests
 */

import { IdentityProvider } from '../implementations/IdentityProvider';

describe('IdentityProvider', () => {
  it('should execute successfully', async () => {
    const layer = new IdentityProvider();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new IdentityProvider();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new IdentityProvider();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
