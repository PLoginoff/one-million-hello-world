/**
 * Integration test: Load Balancer → Service Discovery
 * Verifies that load balancer uses service discovery to find instances
 */

import { RoundRobinAdapter } from '../../load-balancer/adapters/RoundRobinAdapter';
import { InMemoryDiscoveryAdapter } from '../../service-discovery/adapters/InMemoryDiscoveryAdapter';

describe('Load Balancer → Service Discovery Integration', () => {
  it('should load balance across discovered service instances', async () => {
    const discovery = new InMemoryDiscoveryAdapter();
    const lb = new RoundRobinAdapter();

    discovery.register('api-service', '10.0.0.1', 3000);
    discovery.register('api-service', '10.0.0.2', 3000);
    discovery.register('api-service', '10.0.0.3', 3000);

    const discoverResult = await discovery.execute({
      input: 'api-service',
      metadata: { action: 'discover' },
      timestamp: new Date(),
    });

    expect(discoverResult.success).toBe(true);
    const instances = (discoverResult.data as { instances: Array<{ address: string; port: number }> }).instances;
    expect(instances.length).toBe(3);

    lb.configure({ servers: instances.map((i) => `${i.address}:${i.port}`) });

    const results: string[] = [];
    for (let i = 0; i < 6; i++) {
      const lbResult = await lb.execute({ input: 'request', metadata: {}, timestamp: new Date() });
      results.push((lbResult.data as { server: string }).server);
    }

    expect(results.length).toBe(6);
    expect(new Set(results).size).toBe(3);
  });

  it('should handle service going down', async () => {
    const discovery = new InMemoryDiscoveryAdapter();
    const lb = new RoundRobinAdapter();

    const id1 = discovery.register('api', '10.0.0.1', 3000);
    const id2 = discovery.register('api', '10.0.0.2', 3000);

    lb.configure({ servers: ['10.0.0.1:3000', '10.0.0.2:3000'] });

    discovery.deregister('api', id1);
    lb.removeServer('10.0.0.1:3000');

    const discoverResult = await discovery.execute({
      input: 'api',
      metadata: { action: 'discover' },
      timestamp: new Date(),
    });

    const instances = (discoverResult.data as { instances: Array<{ address: string }> }).instances;
    expect(instances.length).toBe(1);

    const lbResult = await lb.execute({ input: 'req', metadata: {}, timestamp: new Date() });
    expect(lbResult.success).toBe(true);
    expect((lbResult.data as { server: string }).server).toBe('10.0.0.2:3000');
  });
});
