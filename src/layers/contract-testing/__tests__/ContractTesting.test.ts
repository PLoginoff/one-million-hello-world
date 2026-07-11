/**
 * ContractTesting Unit Tests
 */

import { ContractTesting } from '../implementations/ContractTesting';

describe('ContractTesting', () => {
  it('should execute successfully', async () => {
    const layer = new ContractTesting();
    const result = await layer.execute({
      input: 'test',
      metadata: {},
      timestamp: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should return active status', () => {
    const layer = new ContractTesting();
    const status = layer.getStatus();
    expect(status.active).toBe(true);
  });

  it('should accept configuration', () => {
    const layer = new ContractTesting();
    layer.configure({ enabled: true });
    expect(layer.getStatus().config).toEqual({ enabled: true });
  });
});
