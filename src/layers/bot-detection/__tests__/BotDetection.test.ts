/**
 * BotDetection Unit Tests
 */

import { BotDetection } from '../implementations/BotDetection';

describe('BotDetection', () => {
  it('should execute successfully', async () => {
    const layer = new BotDetection();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new BotDetection();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new BotDetection();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
