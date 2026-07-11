/**
 * QueryObject Unit Tests
 */

import { QueryObject } from '../implementations/QueryObject';

describe('QueryObject', () => {
  it('should execute successfully', async () => {
    const layer = new QueryObject();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new QueryObject();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new QueryObject();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
