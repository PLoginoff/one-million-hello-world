/**
 * SchemaRegistry Unit Tests
 */

import { SchemaRegistry } from '../implementations/SchemaRegistry';

describe('SchemaRegistry', () => {
  it('should execute successfully', async () => {
    const layer = new SchemaRegistry();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new SchemaRegistry();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new SchemaRegistry();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
