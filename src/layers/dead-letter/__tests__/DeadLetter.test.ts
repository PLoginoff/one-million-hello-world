/**
 * DeadLetter Unit Tests
 */

import { DeadLetter } from '../implementations/DeadLetter';

describe('DeadLetter', () => {
  it('should execute successfully', async () => {
    const layer = new DeadLetter();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new DeadLetter();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new DeadLetter();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
