/**
 * Snapshot Unit Tests
 */

import { Snapshot } from '../implementations/Snapshot';

describe('Snapshot', () => {
  it('should execute successfully', async () => {
    const layer = new Snapshot();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Snapshot();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Snapshot();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
