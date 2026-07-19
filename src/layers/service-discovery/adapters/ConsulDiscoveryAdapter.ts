/**
 * Consul Service Discovery Adapter
 *
 * Mock Consul adapter for testing (simulates HashiCorp Consul).
 */

import { IServiceDiscovery } from '../interfaces/IServiceDiscovery';
import { ServiceDiscoveryContext, ServiceDiscoveryResult } from '../types/service-discovery-types';

interface ConsulService {
  id: string;
  name: string;
  address: string;
  port: number;
  tags: string[];
  status: 'passing' | 'warning' | 'critical';
}

export class ConsulDiscoveryAdapter implements IServiceDiscovery {
  private _consulUrl: string;
  private _services: Map<string, ConsulService>;
  private _config: Record<string, unknown>;

  constructor(consulUrl: string = 'http://localhost:8500') {
    this._consulUrl = consulUrl;
    this._services = new Map();
    this._config = {};
  }

  async execute(context: ServiceDiscoveryContext): Promise<ServiceDiscoveryResult<unknown>> {
    const action = (context.metadata.action as string) ?? 'discover';
    const serviceName = String(context.input);

    if (action === 'discover') {
      const matching = Array.from(this._services.values()).filter(
        (s) => s.name === serviceName && s.status === 'passing'
      );
      if (matching.length === 0) {
        await Promise.resolve();
        return { success: false, error: { code: 'NO_INSTANCES', message: `No healthy instances for ${serviceName}` } };
      }
      await Promise.resolve();
      return { success: true, data: { serviceName, instances: matching, source: 'consul' } };
    }

    if (action === 'register') {
      const id = (context.metadata.instanceId as string) ?? `${serviceName}-${Date.now()}`;
      const service: ConsulService = {
        id,
        name: serviceName,
        address: (context.metadata.address as string) ?? 'localhost',
        port: (context.metadata.port as number) ?? 8080,
        tags: (context.metadata.tags as string[]) ?? [],
        status: 'passing',
      };
      this._services.set(id, service);
      await Promise.resolve();
      return { success: true, data: { serviceName, service, source: 'consul' } };
    }

    if (action === 'deregister') {
      const id = (context.metadata.instanceId as string) ?? '';
      this._services.delete(id);
      await Promise.resolve();
      return { success: true, data: { serviceName, deregistered: id, source: 'consul' } };
    }

    await Promise.resolve();
    return { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.consulUrl === 'string') {
      this._consulUrl = config.consulUrl;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'consul',
      consulUrl: this._consulUrl,
      registeredServices: this._services.size,
    };
  }

  setHealth(id: string, status: 'passing' | 'warning' | 'critical'): void {
    const service = this._services.get(id);
    if (service) {
      service.status = status;
    }
  }
}
