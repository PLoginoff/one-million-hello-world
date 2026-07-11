/**
 * EtlPipeline Unit Tests
 */

import { EtlPipeline } from '../implementations/EtlPipeline';

describe('EtlPipeline', () => {
  it('should execute successfully', async () => {
    const layer = new EtlPipeline();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new EtlPipeline();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new EtlPipeline();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
