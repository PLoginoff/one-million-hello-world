import { ServiceDiscovery } from '../implementations/ServiceDiscovery';
import {
  DefaultServiceDiscoveryStrategy,
  OptimizedServiceDiscoveryStrategy,
} from '../strategies/ServiceDiscoveryStrategy';

export class ServiceDiscoveryFactory {
  static createDefault(): ServiceDiscovery {
    const instance = new ServiceDiscovery();
    instance.configure({ strategy: new DefaultServiceDiscoveryStrategy() });
    return instance;
  }

  static createOptimized(): ServiceDiscovery {
    const instance = new ServiceDiscovery();
    instance.configure({ strategy: new OptimizedServiceDiscoveryStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ServiceDiscovery {
    const instance = new ServiceDiscovery();
    instance.configure(config);
    return instance;
  }
}
