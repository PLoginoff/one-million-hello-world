import { DataQuality } from '../implementations/DataQuality';
import { DefaultDataQualityStrategy, OptimizedDataQualityStrategy } from '../strategies/DataQualityStrategy';

export class DataQualityFactory {
  static createDefault(): DataQuality {
    const instance = new DataQuality();
    instance.configure({ strategy: new DefaultDataQualityStrategy() });
    return instance;
  }

  static createOptimized(): DataQuality {
    const instance = new DataQuality();
    instance.configure({ strategy: new OptimizedDataQualityStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): DataQuality {
    const instance = new DataQuality();
    instance.configure(config);
    return instance;
  }
}
