import { Cqrs } from '../implementations/Cqrs';
import { DefaultCqrsStrategy, OptimizedCqrsStrategy } from '../strategies/CqrsStrategy';

export class CqrsFactory {
  static createDefault(): Cqrs {
    const instance = new Cqrs();
    instance.configure({ strategy: new DefaultCqrsStrategy() });
    return instance;
  }

  static createOptimized(): Cqrs {
    const instance = new Cqrs();
    instance.configure({ strategy: new OptimizedCqrsStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Cqrs {
    const instance = new Cqrs();
    instance.configure(config);
    return instance;
  }
}
