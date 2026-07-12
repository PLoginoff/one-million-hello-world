import { DistributedTracing } from '../implementations/DistributedTracing';
import {
  DefaultDistributedTracingStrategy,
  OptimizedDistributedTracingStrategy,
} from '../strategies/DistributedTracingStrategy';

export class DistributedTracingFactory {
  static createDefault(): DistributedTracing {
    const instance = new DistributedTracing();
    instance.configure({ strategy: new DefaultDistributedTracingStrategy() });
    return instance;
  }

  static createOptimized(): DistributedTracing {
    const instance = new DistributedTracing();
    instance.configure({ strategy: new OptimizedDistributedTracingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): DistributedTracing {
    const instance = new DistributedTracing();
    instance.configure(config);
    return instance;
  }
}
