import { DataWarehouse } from '../implementations/DataWarehouse';
import { DefaultDataWarehouseStrategy, OptimizedDataWarehouseStrategy } from '../strategies/DataWarehouseStrategy';

export class DataWarehouseFactory {
  static createDefault(): DataWarehouse {
    const instance = new DataWarehouse();
    instance.configure({ strategy: new DefaultDataWarehouseStrategy() });
    return instance;
  }

  static createOptimized(): DataWarehouse {
    const instance = new DataWarehouse();
    instance.configure({ strategy: new OptimizedDataWarehouseStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): DataWarehouse {
    const instance = new DataWarehouse();
    instance.configure(config);
    return instance;
  }
}
