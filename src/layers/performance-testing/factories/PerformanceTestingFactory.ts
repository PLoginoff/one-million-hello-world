import { PerformanceTesting } from '../implementations/PerformanceTesting';
import { DefaultPerformanceTestingStrategy, OptimizedPerformanceTestingStrategy } from '../strategies/PerformanceTestingStrategy';

export class PerformanceTestingFactory {
  static createDefault(): PerformanceTesting {
    const instance = new PerformanceTesting();
    instance.configure({ strategy: new DefaultPerformanceTestingStrategy() });
    return instance;
  }

  static createOptimized(): PerformanceTesting {
    const instance = new PerformanceTesting();
    instance.configure({ strategy: new OptimizedPerformanceTestingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): PerformanceTesting {
    const instance = new PerformanceTesting();
    instance.configure(config);
    return instance;
  }
}
