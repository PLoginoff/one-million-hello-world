import { MlFeatureStore } from '../implementations/MlFeatureStore';
import { MlFeatureStoreContext } from '../types/ml-feature-store-types';

function createContext(input: unknown): MlFeatureStoreContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('MlFeatureStore', () => {
  let instance: MlFeatureStore;

  beforeEach(() => { instance = new MlFeatureStore(); });

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
    expect(status.layer).toBe('ml-feature-store');
  });
});
