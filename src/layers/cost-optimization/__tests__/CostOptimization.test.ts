import { CostOptimization } from '../implementations/CostOptimization';
import { CostOptimizationContext } from '../types/cost-optimization-types';

function createContext(input: unknown): CostOptimizationContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('CostOptimization', () => {
  let instance: CostOptimization;

  beforeEach(() => { instance = new CostOptimization(); });

  it('should execute successfully', async () => {
    const result = await instance.execute(createContext('test'));
    expect(result.success).toBe(true);
  });

  it('should configure', () => {
    instance.configure({ key: 'value' });
    const status = instance.getStatus();
    expect(status.initialized).toBe(true);
  });

  it('should return status', () => {
    const status = instance.getStatus();
    expect(status.layer).toBe('cost-optimization');
  });
});
