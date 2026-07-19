import { MultiTenancy } from '../implementations/MultiTenancy';
import { MultiTenancyContext } from '../types/multi-tenancy-types';

function createContext(input: unknown): MultiTenancyContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('MultiTenancy', () => {
  let instance: MultiTenancy;

  beforeEach(() => { instance = new MultiTenancy(); });

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
    expect(status.layer).toBe('multi-tenancy');
  });
});
