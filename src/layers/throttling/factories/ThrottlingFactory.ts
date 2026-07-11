import { Throttling } from '../implementations/Throttling';
import { DefaultThrottlingStrategy, OptimizedThrottlingStrategy } from '../strategies/ThrottlingStrategy';

export class ThrottlingFactory {
  static createDefault(): Throttling {
    const instance = new Throttling();
    instance.configure({ strategy: new DefaultThrottlingStrategy() });
    return instance;
  }

  static createOptimized(): Throttling {
    const instance = new Throttling();
    instance.configure({ strategy: new OptimizedThrottlingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Throttling {
    const instance = new Throttling();
    instance.configure(config);
    return instance;
  }
}
