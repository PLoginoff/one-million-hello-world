/**
 * UnitOfWork Unit Tests
 */

import { UnitOfWork } from '../implementations/UnitOfWork';

describe('UnitOfWork', () => {
  it('should execute successfully', async () => {
    const layer = new UnitOfWork();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new UnitOfWork();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new UnitOfWork();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
