import { Reporting } from '../implementations/Reporting';
import { ReportingContext } from '../types/reporting-types';

function createContext(input: unknown): ReportingContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Reporting', () => {
  let instance: Reporting;

  beforeEach(() => { instance = new Reporting(); });

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
    expect(status.layer).toBe('reporting');
  });
});
