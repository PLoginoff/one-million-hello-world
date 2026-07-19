/**
 * Weighted Load Balancer Adapter
 *
 * Distributes requests across servers using weighted round-robin algorithm.
 */

import { ILoadBalancer } from '../interfaces/ILoadBalancer';
import { LoadBalancerContext, LoadBalancerResult } from '../types/load-balancer-types';

interface WeightedServer {
  address: string;
  weight: number;
  currentWeight: number;
}

export class WeightedAdapter implements ILoadBalancer {
  private _servers: WeightedServer[];
  private _config: Record<string, unknown>;

  constructor(servers: Array<{ address: string; weight: number }> = []) {
    this._servers = servers.map((s) => ({ ...s, currentWeight: 0 }));
    this._config = {};
  }

  async execute(context: LoadBalancerContext): Promise<LoadBalancerResult<unknown>> {
    if (this._servers.length === 0) {
      await Promise.resolve();
      return { success: false, error: { code: 'NO_SERVERS', message: 'No servers available' } };
    }

    const totalWeight = this._servers.reduce((sum, s) => sum + s.weight, 0);
    for (const server of this._servers) {
      server.currentWeight += server.weight;
    }

    let selected = this._servers[0];
    for (const server of this._servers) {
      if (server.currentWeight > selected.currentWeight) {
        selected = server;
      }
    }

    selected.currentWeight -= totalWeight;

    await Promise.resolve();
    return {
      success: true,
      data: { server: selected.address, input: context.input, algorithm: 'weighted' },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (Array.isArray(config.servers)) {
      this._servers = (config.servers as Array<{ address: string; weight: number }>).map((s) => ({
        ...s,
        currentWeight: 0,
      }));
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      algorithm: 'weighted',
      serverCount: this._servers.length,
      servers: this._servers.map((s) => ({ address: s.address, weight: s.weight })),
    };
  }

  addServer(address: string, weight: number = 1): void {
    this._servers.push({ address, weight, currentWeight: 0 });
  }

  removeServer(address: string): void {
    this._servers = this._servers.filter((s) => s.address !== address);
  }
}
