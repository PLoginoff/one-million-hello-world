/**
 * DataQuality Unit Tests
 */

import { DataQuality } from '../implementations/DataQuality';

describe('DataQuality', () => {
  it('should execute successfully', async () => {
    const layer = new DataQuality();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new DataQuality();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new DataQuality();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
