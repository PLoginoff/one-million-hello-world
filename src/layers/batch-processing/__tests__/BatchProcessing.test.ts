import { BatchProcessing } from '../implementations/BatchProcessing';
import { BatchProcessingContext } from '../types/batch-processing-types';

function createContext(input: unknown): BatchProcessingContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('BatchProcessing', () => {
  let instance: BatchProcessing;

  beforeEach(() => { instance = new BatchProcessing(); });

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
    expect(status.layer).toBe('batch-processing');
  });
});
