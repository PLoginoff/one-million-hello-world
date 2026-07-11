/**
 * Authorization Unit Tests
 */

import { Authorization } from '../implementations/Authorization';

describe('Authorization', () => {
  it('should execute successfully', async () => {
    const layer = new Authorization();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Authorization();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Authorization();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
