/**
 * EventSourcing Unit Tests
 */

import { EventSourcing } from '../implementations/EventSourcing';

describe('EventSourcing', () => {
  it('should execute successfully', async () => {
    const layer = new EventSourcing();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new EventSourcing();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new EventSourcing();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
