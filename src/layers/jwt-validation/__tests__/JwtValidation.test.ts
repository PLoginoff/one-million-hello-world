/**
 * JwtValidation Unit Tests
 */

import { JwtValidation } from '../implementations/JwtValidation';

describe('JwtValidation', () => {
  it('should execute successfully', async () => {
    const layer = new JwtValidation();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new JwtValidation();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new JwtValidation();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
