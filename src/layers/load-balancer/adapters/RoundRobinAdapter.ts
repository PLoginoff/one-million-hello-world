/**
 * Round-Robin Load Balancer Adapter
 *
 * Distributes requests across servers using round-robin algorithm.
 */

import { ILoadBalancer } from '../interfaces/ILoadBalancer';
import { LoadBalancerContext, LoadBalancerResult } from '../types/load-balancer-types';

export class RoundRobinAdapter implements ILoadBalancer {
  private _servers: string[];
  private _index: number;
  private _config: Record<string, unknown>;

  constructor(servers: string[] = []) {
    this._servers = servers;
    this._index = 0;
    this._config = {};
  }

  async execute(context: LoadBalancerContext): Promise<LoadBalancerResult<unknown>> {
    if (this._servers.length === 0) {
      await Promise.resolve();
      return { success: false, error: { code: 'NO_SERVERS', message: 'No servers available' } };
    }

    const server = this._servers[this._index % this._servers.length];
    this._index = (this._index + 1) % this._servers.length;

    await Promise.resolve();
    return {
      success: true,
      data: { server, input: context.input, algorithm: 'round-robin' },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (Array.isArray(config.servers)) {
      this._servers = config.servers as string[];
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      algorithm: 'round-robin',
      serverCount: this._servers.length,
      currentIndex: this._index,
      servers: [...this._servers],
    };
  }

  addServer(server: string): void {
    this._servers.push(server);
  }

  removeServer(server: string): void {
    this._servers = this._servers.filter((s) => s !== server);
  }
}
