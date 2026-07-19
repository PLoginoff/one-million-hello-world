import { RoundRobinAdapter } from '../adapters/RoundRobinAdapter';
import { WeightedAdapter } from '../adapters/WeightedAdapter';
import { LoadBalancerContext } from '../types/load-balancer-types';

function createContext(input: unknown): LoadBalancerContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('RoundRobinAdapter', () => {
  let adapter: RoundRobinAdapter;

  beforeEach(() => {
    adapter = new RoundRobinAdapter(['server1', 'server2', 'server3']);
  });

  it('should distribute requests round-robin', async () => {
    const r1 = await adapter.execute(createContext('req1'));
    const r2 = await adapter.execute(createContext('req2'));
    const r3 = await adapter.execute(createContext('req3'));
    const r4 = await adapter.execute(createContext('req4'));

    expect(r1.success).toBe(true);
    expect((r1.data as { server: string }).server).toBe('server1');
    expect((r2.data as { server: string }).server).toBe('server2');
    expect((r3.data as { server: string }).server).toBe('server3');
    expect((r4.data as { server: string }).server).toBe('server1');
  });

  it('should fail with no servers', async () => {
    const empty = new RoundRobinAdapter();
    const result = await empty.execute(createContext('req'));
    expect(result.success).toBe(false);
  });

  it('should support add/remove server', async () => {
    adapter.addServer('server4');
    expect(adapter.getStatus().serverCount).toBe(4);
    adapter.removeServer('server1');
    expect(adapter.getStatus().serverCount).toBe(3);
  });

  it('should configure from config object', () => {
    const adapter = new RoundRobinAdapter();
    adapter.configure({ servers: ['a', 'b'] });
    expect(adapter.getStatus().serverCount).toBe(2);
  });
});

describe('WeightedAdapter', () => {
  let adapter: WeightedAdapter;

  beforeEach(() => {
    adapter = new WeightedAdapter([
      { address: 'heavy', weight: 5 },
      { address: 'light', weight: 1 },
    ]);
  });

  it('should distribute requests by weight', async () => {
    const results: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await adapter.execute(createContext('req'));
      results.push((r.data as { server: string }).server);
    }
    const heavyCount = results.filter((s) => s === 'heavy').length;
    const lightCount = results.filter((s) => s === 'light').length;
    expect(heavyCount + lightCount).toBe(6);
    expect(heavyCount).toBeGreaterThan(lightCount);
  });

  it('should fail with no servers', async () => {
    const empty = new WeightedAdapter();
    const result = await empty.execute(createContext('req'));
    expect(result.success).toBe(false);
  });

  it('should support add/remove server', () => {
    adapter.addServer('new', 3);
    expect(adapter.getStatus().serverCount).toBe(3);
    adapter.removeServer('heavy');
    expect(adapter.getStatus().serverCount).toBe(2);
  });
});
