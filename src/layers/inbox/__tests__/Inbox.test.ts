/**
 * Inbox Unit Tests
 */

import { Inbox } from '../implementations/Inbox';

describe('Inbox', () => {
  it('should execute successfully', async () => {
    const layer = new Inbox();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Inbox();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Inbox();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
