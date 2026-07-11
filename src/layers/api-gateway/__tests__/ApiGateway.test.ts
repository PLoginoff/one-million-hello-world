/**
 * ApiGateway Unit Tests
 */

import { ApiGateway } from '../implementations/ApiGateway';

describe('ApiGateway', () => {
  it('should execute successfully', async () => {
    const layer = new ApiGateway();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new ApiGateway();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new ApiGateway();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
