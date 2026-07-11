import { UnitOfWork } from '../implementations/UnitOfWork';
import { DefaultUnitOfWorkStrategy, OptimizedUnitOfWorkStrategy } from '../strategies/UnitOfWorkStrategy';

export class UnitOfWorkFactory {
  static createDefault(): UnitOfWork {
    const instance = new UnitOfWork();
    instance.configure({ strategy: new DefaultUnitOfWorkStrategy() });
    return instance;
  }

  static createOptimized(): UnitOfWork {
    const instance = new UnitOfWork();
    instance.configure({ strategy: new OptimizedUnitOfWorkStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): UnitOfWork {
    const instance = new UnitOfWork();
    instance.configure(config);
    return instance;
  }
}
