import { InMemoryDiscoveryAdapter } from '../adapters/InMemoryDiscoveryAdapter';
import { ConsulDiscoveryAdapter } from '../adapters/ConsulDiscoveryAdapter';
import { ServiceDiscoveryContext } from '../types/service-discovery-types';

function createContext(input: unknown, metadata: Record<string, unknown> = {}): ServiceDiscoveryContext {
  return { input, metadata, timestamp: new Date() };
}

describe('InMemoryDiscoveryAdapter', () => {
  let adapter: InMemoryDiscoveryAdapter;

  beforeEach(() => {
    adapter = new InMemoryDiscoveryAdapter();
  });

  it('should register a service', async () => {
    const result = await adapter.execute(createContext('my-service', {
      action: 'register',
      address: '10.0.0.1',
      port: 8080,
    }));
    expect(result.success).toBe(true);
  });

  it('should discover registered service', async () => {
    adapter.register('api', '10.0.0.1', 3000);
    const result = await adapter.execute(createContext('api', { action: 'discover' }));
    expect(result.success).toBe(true);
    const data = result.data as { instances: Array<{ address: string }> };
    expect(data.instances.length).toBe(1);
  });

  it('should fail to discover unregistered service', async () => {
    const result = await adapter.execute(createContext('unknown', { action: 'discover' }));
    expect(result.success).toBe(false);
  });

  it('should deregister a service', async () => {
    const id = adapter.register('api', '10.0.0.1', 3000);
    await adapter.execute(createContext('api', { action: 'deregister', instanceId: id }));
    const result = await adapter.execute(createContext('api', { action: 'discover' }));
    expect(result.success).toBe(false);
  });

  it('should return status', () => {
    adapter.register('svc', 'localhost', 80);
    expect(adapter.getStatus().adapter).toBe('in-memory');
    expect(adapter.getStatus().serviceCount).toBe(1);
  });
});

describe('ConsulDiscoveryAdapter', () => {
  let adapter: ConsulDiscoveryAdapter;

  beforeEach(() => {
    adapter = new ConsulDiscoveryAdapter('http://consul:8500');
  });

  it('should register a service', async () => {
    const result = await adapter.execute(createContext('my-service', {
      action: 'register',
      address: '10.0.0.2',
      port: 9090,
    }));
    expect(result.success).toBe(true);
  });

  it('should discover registered service', async () => {
    await adapter.execute(createContext('api', {
      action: 'register',
      address: '10.0.0.2',
      port: 9090,
    }));
    const result = await adapter.execute(createContext('api', { action: 'discover' }));
    expect(result.success).toBe(true);
  });

  it('should not discover unhealthy service', async () => {
    const regResult = await adapter.execute(createContext('api', {
      action: 'register',
      instanceId: 'inst-1',
      address: '10.0.0.2',
      port: 9090,
    }));
    const id = (regResult.data as { service: { id: string } }).service.id;
    adapter.setHealth(id, 'critical');
    const result = await adapter.execute(createContext('api', { action: 'discover' }));
    expect(result.success).toBe(false);
  });

  it('should return status with Consul URL', () => {
    const status = adapter.getStatus();
    expect(status.adapter).toBe('consul');
    expect(status.consulUrl).toBe('http://consul:8500');
  });
});
