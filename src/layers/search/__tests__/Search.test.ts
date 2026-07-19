import { Search } from '../implementations/Search';
import { SearchContext } from '../types/search-types';

function createContext(input: unknown): SearchContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Search', () => {
  let instance: Search;

  beforeEach(() => { instance = new Search(); });

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
    expect(status.layer).toBe('search');
  });
});
