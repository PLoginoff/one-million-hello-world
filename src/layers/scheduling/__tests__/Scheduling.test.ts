import { Scheduling } from '../implementations/Scheduling';
import { SchedulingContext } from '../types/scheduling-types';

function createContext(input: unknown): SchedulingContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Scheduling', () => {
  let instance: Scheduling;

  beforeEach(() => { instance = new Scheduling(); });

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
    expect(status.layer).toBe('scheduling');
  });
});
