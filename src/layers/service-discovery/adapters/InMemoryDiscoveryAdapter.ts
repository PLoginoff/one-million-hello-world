/**
 * In-Memory Service Discovery Adapter
 *
 * Maintains service registry in memory for testing.
 */

import { IServiceDiscovery } from '../interfaces/IServiceDiscovery';
import { ServiceDiscoveryContext, ServiceDiscoveryResult } from '../types/service-discovery-types';

interface ServiceInstance {
  id: string;
  address: string;
  port: number;
  healthy: boolean;
}

export class InMemoryDiscoveryAdapter implements IServiceDiscovery {
  private _services: Map<string, ServiceInstance[]>;
  private _config: Record<string, unknown>;

  constructor() {
    this._services = new Map();
    this._config = {};
  }

  async execute(context: ServiceDiscoveryContext): Promise<ServiceDiscoveryResult<unknown>> {
    const action = (context.metadata.action as string) ?? 'discover';
    const serviceName = String(context.input);

    if (action === 'discover') {
      const instances = this._services.get(serviceName) ?? [];
      const healthy = instances.filter((i) => i.healthy);
      if (healthy.length === 0) {
        await Promise.resolve();
        return { success: false, error: { code: 'NO_INSTANCES', message: `No healthy instances for ${serviceName}` } };
      }
      await Promise.resolve();
      return { success: true, data: { serviceName, instances: healthy } };
    }

    if (action === 'register') {
      const instance: ServiceInstance = {
        id: (context.metadata.instanceId as string) ?? `${serviceName}-${Date.now()}`,
        address: (context.metadata.address as string) ?? 'localhost',
        port: (context.metadata.port as number) ?? 8080,
        healthy: true,
      };
      const instances = this._services.get(serviceName) ?? [];
      instances.push(instance);
      this._services.set(serviceName, instances);
      await Promise.resolve();
      return { success: true, data: { serviceName, instance } };
    }

    if (action === 'deregister') {
      const instanceId = (context.metadata.instanceId as string) ?? '';
      const instances = this._services.get(serviceName) ?? [];
      this._services.set(
        serviceName,
        instances.filter((i) => i.id !== instanceId)
      );
      await Promise.resolve();
      return { success: true, data: { serviceName, deregistered: instanceId } };
    }

    await Promise.resolve();
    return { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
  }

  getStatus(): Record<string, unknown> {
    const serviceCount = this._services.size;
    let totalInstances = 0;
    for (const instances of this._services.values()) {
      totalInstances += instances.length;
    }
    return { adapter: 'in-memory', serviceCount, totalInstances };
  }

  register(serviceName: string, address: string, port: number): string {
    const id = `${serviceName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const instances = this._services.get(serviceName) ?? [];
    instances.push({ id, address, port, healthy: true });
    this._services.set(serviceName, instances);
    return id;
  }

  deregister(serviceName: string, instanceId: string): void {
    const instances = this._services.get(serviceName) ?? [];
    this._services.set(
      serviceName,
      instances.filter((i) => i.id !== instanceId)
    );
  }
}
