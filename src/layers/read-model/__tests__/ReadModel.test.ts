/**
 * ReadModel Unit Tests
 */

import { ReadModel } from '../implementations/ReadModel';

describe('ReadModel', () => {
  it('should execute successfully', async () => {
    const layer = new ReadModel();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new ReadModel();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new ReadModel();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
