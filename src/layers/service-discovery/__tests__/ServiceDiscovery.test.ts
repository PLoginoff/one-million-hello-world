/**
 * ServiceDiscovery Unit Tests
 */

import { ServiceDiscovery } from '../implementations/ServiceDiscovery';

describe('ServiceDiscovery', () => {
  it('should execute successfully', async () => {
    const layer = new ServiceDiscovery();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new ServiceDiscovery();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new ServiceDiscovery();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
