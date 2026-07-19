import { ApiVersioning } from '../implementations/ApiVersioning';
import { ApiVersioningContext } from '../types/api-versioning-types';

function createContext(input: unknown): ApiVersioningContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('ApiVersioning', () => {
  let instance: ApiVersioning;

  beforeEach(() => { instance = new ApiVersioning(); });

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
    expect(status.layer).toBe('api-versioning');
  });
});
