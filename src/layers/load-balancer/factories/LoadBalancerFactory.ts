import { LoadBalancer } from '../implementations/LoadBalancer';
import { DefaultLoadBalancerStrategy, OptimizedLoadBalancerStrategy } from '../strategies/LoadBalancerStrategy';

export class LoadBalancerFactory {
  static createDefault(): LoadBalancer {
    const instance = new LoadBalancer();
    instance.configure({ strategy: new DefaultLoadBalancerStrategy() });
    return instance;
  }

  static createOptimized(): LoadBalancer {
    const instance = new LoadBalancer();
    instance.configure({ strategy: new OptimizedLoadBalancerStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): LoadBalancer {
    const instance = new LoadBalancer();
    instance.configure(config);
    return instance;
  }
}
