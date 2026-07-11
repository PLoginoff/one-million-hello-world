/**
 * Oauth2 Unit Tests
 */

import { Oauth2 } from '../implementations/Oauth2';

describe('Oauth2', () => {
  it('should execute successfully', async () => {
    const layer = new Oauth2();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Oauth2();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Oauth2();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
