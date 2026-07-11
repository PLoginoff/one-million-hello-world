/**
 * Bpmn Unit Tests
 */

import { Bpmn } from '../implementations/Bpmn';

describe('Bpmn', () => {
  it('should execute successfully', async () => {
    const layer = new Bpmn();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new Bpmn();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new Bpmn();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
