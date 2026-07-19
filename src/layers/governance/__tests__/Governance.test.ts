import { Governance } from '../implementations/Governance';
import { GovernanceContext } from '../types/governance-types';

function createContext(input: unknown): GovernanceContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Governance', () => {
  let instance: Governance;

  beforeEach(() => { instance = new Governance(); });

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
    expect(status.layer).toBe('governance');
  });
});
