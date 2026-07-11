import { Analytics } from '../implementations/Analytics';
import { DefaultAnalyticsStrategy, OptimizedAnalyticsStrategy } from '../strategies/AnalyticsStrategy';

export class AnalyticsFactory {
  static createDefault(): Analytics {
    const instance = new Analytics();
    instance.configure({ strategy: new DefaultAnalyticsStrategy() });
    return instance;
  }

  static createOptimized(): Analytics {
    const instance = new Analytics();
    instance.configure({ strategy: new OptimizedAnalyticsStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Analytics {
    const instance = new Analytics();
    instance.configure(config);
    return instance;
  }
}
