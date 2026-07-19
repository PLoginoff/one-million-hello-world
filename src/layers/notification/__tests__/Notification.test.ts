import { Notification } from '../implementations/Notification';
import { NotificationContext } from '../types/notification-types';

function createContext(input: unknown): NotificationContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('Notification', () => {
  let instance: Notification;

  beforeEach(() => { instance = new Notification(); });

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
    expect(status.layer).toBe('notification');
  });
});
