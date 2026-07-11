/**
 * MessageBus Unit Tests
 */

import { MessageBus } from '../implementations/MessageBus';

describe('MessageBus', () => {
  it('should execute successfully', async () => {
    const layer = new MessageBus();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new MessageBus();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new MessageBus();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
