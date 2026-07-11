import { Observability } from '../implementations/Observability';
import { DefaultObservabilityStrategy, OptimizedObservabilityStrategy } from '../strategies/ObservabilityStrategy';

export class ObservabilityFactory {
  static createDefault(): Observability {
    const instance = new Observability();
    instance.configure({ strategy: new DefaultObservabilityStrategy() });
    return instance;
  }

  static createOptimized(): Observability {
    const instance = new Observability();
    instance.configure({ strategy: new OptimizedObservabilityStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Observability {
    const instance = new Observability();
    instance.configure(config);
    return instance;
  }
}
