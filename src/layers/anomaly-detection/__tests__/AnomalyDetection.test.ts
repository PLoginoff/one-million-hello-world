import { AnomalyDetection } from '../implementations/AnomalyDetection';
import { AnomalyDetectionContext } from '../types/anomaly-detection-types';

function createContext(input: unknown): AnomalyDetectionContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('AnomalyDetection', () => {
  let instance: AnomalyDetection;

  beforeEach(() => { instance = new AnomalyDetection(); });

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
    expect(status.layer).toBe('anomaly-detection');
  });
});
