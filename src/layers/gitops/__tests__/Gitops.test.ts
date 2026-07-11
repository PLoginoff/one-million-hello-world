/**
 * Gitops Unit Tests
 */

import { Gitops } from '../implementations/Gitops';

describe('Gitops', () => {
  it('should execute successfully', async () => {
    const layer = new Gitops();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Gitops();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Gitops();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
