import { Waf } from '../implementations/Waf';
import { DefaultWafStrategy, OptimizedWafStrategy } from '../strategies/WafStrategy';

export class WafFactory {
  static createDefault(): Waf {
    const instance = new Waf();
    instance.configure({ strategy: new DefaultWafStrategy() });
    return instance;
  }

  static createOptimized(): Waf {
    const instance = new Waf();
    instance.configure({ strategy: new OptimizedWafStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Waf {
    const instance = new Waf();
    instance.configure(config);
    return instance;
  }
}
