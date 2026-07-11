import { ReadModel } from '../implementations/ReadModel';
import { DefaultReadModelStrategy, OptimizedReadModelStrategy } from '../strategies/ReadModelStrategy';

export class ReadModelFactory {
  static createDefault(): ReadModel {
    const instance = new ReadModel();
    instance.configure({ strategy: new DefaultReadModelStrategy() });
    return instance;
  }

  static createOptimized(): ReadModel {
    const instance = new ReadModel();
    instance.configure({ strategy: new OptimizedReadModelStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ReadModel {
    const instance = new ReadModel();
    instance.configure(config);
    return instance;
  }
}
