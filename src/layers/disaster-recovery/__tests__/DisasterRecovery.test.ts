import { DisasterRecovery } from '../implementations/DisasterRecovery';
import { DisasterRecoveryContext } from '../types/disaster-recovery-types';

function createContext(input: unknown): DisasterRecoveryContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('DisasterRecovery', () => {
  let instance: DisasterRecovery;

  beforeEach(() => { instance = new DisasterRecovery(); });

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
    expect(status.layer).toBe('disaster-recovery');
  });
});
