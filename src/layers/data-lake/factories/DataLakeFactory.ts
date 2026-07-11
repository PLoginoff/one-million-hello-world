import { DataLake } from '../implementations/DataLake';
import { DefaultDataLakeStrategy, OptimizedDataLakeStrategy } from '../strategies/DataLakeStrategy';

export class DataLakeFactory {
  static createDefault(): DataLake {
    const instance = new DataLake();
    instance.configure({ strategy: new DefaultDataLakeStrategy() });
    return instance;
  }

  static createOptimized(): DataLake {
    const instance = new DataLake();
    instance.configure({ strategy: new OptimizedDataLakeStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): DataLake {
    const instance = new DataLake();
    instance.configure(config);
    return instance;
  }
}
