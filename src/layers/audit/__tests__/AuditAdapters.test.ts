import { FileAuditAdapter } from '../adapters/FileAuditAdapter';
import { SiemAuditAdapter } from '../adapters/SiemAuditAdapter';
import { AuditContext } from '../types/audit-types';

function createContext(input: unknown, metadata: Record<string, unknown> = {}): AuditContext {
  return { input, metadata, timestamp: new Date() };
}

describe('FileAuditAdapter', () => {
  let adapter: FileAuditAdapter;

  beforeEach(() => {
    adapter = new FileAuditAdapter('/tmp/audit.log');
  });

  it('should write audit entry', async () => {
    const result = await adapter.execute(createContext('user-login', { userId: '123' }));
    expect(result.success).toBe(true);
    expect(adapter.getEntries().length).toBe(1);
  });

  it('should store entry details', async () => {
    await adapter.execute(createContext('action', { user: 'admin' }));
    const entries = adapter.getEntries();
    expect(entries[0].input).toBe('action');
    expect(entries[0].metadata.user).toBe('admin');
  });

  it('should clear entries', async () => {
    await adapter.execute(createContext('test'));
    adapter.clear();
    expect(adapter.getEntries().length).toBe(0);
  });

  it('should return status', () => {
    const status = adapter.getStatus();
    expect(status.adapter).toBe('file');
  });
});

describe('SiemAuditAdapter', () => {
  let adapter: SiemAuditAdapter;

  beforeEach(() => {
    adapter = new SiemAuditAdapter('http://siem:8080', 'api-key');
  });

  it('should send event to SIEM', async () => {
    const result = await adapter.execute(createContext('security-event', { severity: 'critical' }));
    expect(result.success).toBe(true);
    expect(adapter.getEvents().length).toBe(1);
  });

  it('should store event severity', async () => {
    await adapter.execute(createContext('alert', { severity: 'warning' }));
    const events = adapter.getEvents();
    expect(events[0].severity).toBe('warning');
  });

  it('should default to info severity', async () => {
    await adapter.execute(createContext('info-event'));
    const events = adapter.getEvents();
    expect(events[0].severity).toBe('info');
  });

  it('should clear events', async () => {
    await adapter.execute(createContext('test'));
    adapter.clear();
    expect(adapter.getEvents().length).toBe(0);
  });

  it('should return status', () => {
    const status = adapter.getStatus();
    expect(status.adapter).toBe('siem');
    expect(status.connected).toBe(true);
  });
});
