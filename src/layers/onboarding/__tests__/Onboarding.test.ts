import { Onboarding } from '../implementations/Onboarding';
import { OnboardingContext } from '../types/onboarding-types';

function createContext(input: unknown): OnboardingContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Onboarding', () => {
  let instance: Onboarding;

  beforeEach(() => { instance = new Onboarding(); });

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
    expect(status.layer).toBe('onboarding');
  });
});
