import { Localization } from '../implementations/Localization';
import { LocalizationContext } from '../types/localization-types';

function createContext(input: unknown): LocalizationContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Localization', () => {
  let instance: Localization;

  beforeEach(() => { instance = new Localization(); });

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
    expect(status.layer).toBe('localization');
  });
});
