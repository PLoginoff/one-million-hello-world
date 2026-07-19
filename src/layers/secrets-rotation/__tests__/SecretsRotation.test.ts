import { SecretsRotation } from '../implementations/SecretsRotation';
import { SecretsRotationContext } from '../types/secrets-rotation-types';

function createContext(input: unknown): SecretsRotationContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('SecretsRotation', () => {
  let instance: SecretsRotation;

  beforeEach(() => { instance = new SecretsRotation(); });

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
    expect(status.layer).toBe('secrets-rotation');
  });
});
