import { DataLineage } from '../implementations/DataLineage';
import { DataLineageContext } from '../types/data-lineage-types';

function createContext(input: unknown): DataLineageContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('DataLineage', () => {
  let instance: DataLineage;

  beforeEach(() => { instance = new DataLineage(); });

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
    expect(status.layer).toBe('data-lineage');
  });
});
