import { Recommendation } from '../implementations/Recommendation';
import { RecommendationContext } from '../types/recommendation-types';

function createContext(input: unknown): RecommendationContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Recommendation', () => {
  let instance: Recommendation;

  beforeEach(() => { instance = new Recommendation(); });

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
    expect(status.layer).toBe('recommendation');
  });
});
