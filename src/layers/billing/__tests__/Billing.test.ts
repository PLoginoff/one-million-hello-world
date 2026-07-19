import { Billing } from '../implementations/Billing';
import { BillingContext } from '../types/billing-types';

function createContext(input: unknown): BillingContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Billing', () => {
  let instance: Billing;

  beforeEach(() => { instance = new Billing(); });

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
    expect(status.layer).toBe('billing');
  });
});
