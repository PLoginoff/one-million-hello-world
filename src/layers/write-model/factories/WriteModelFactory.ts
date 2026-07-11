import { WriteModel } from '../implementations/WriteModel';
import { DefaultWriteModelStrategy, OptimizedWriteModelStrategy } from '../strategies/WriteModelStrategy';

export class WriteModelFactory {
  static createDefault(): WriteModel {
    const instance = new WriteModel();
    instance.configure({ strategy: new DefaultWriteModelStrategy() });
    return instance;
  }

  static createOptimized(): WriteModel {
    const instance = new WriteModel();
    instance.configure({ strategy: new OptimizedWriteModelStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): WriteModel {
    const instance = new WriteModel();
    instance.configure(config);
    return instance;
  }
}
