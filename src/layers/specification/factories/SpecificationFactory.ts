import { Specification } from '../implementations/Specification';
import { DefaultSpecificationStrategy, OptimizedSpecificationStrategy } from '../strategies/SpecificationStrategy';

export class SpecificationFactory {
  static createDefault(): Specification {
    const instance = new Specification();
    instance.configure({ strategy: new DefaultSpecificationStrategy() });
    return instance;
  }

  static createOptimized(): Specification {
    const instance = new Specification();
    instance.configure({ strategy: new OptimizedSpecificationStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Specification {
    const instance = new Specification();
    instance.configure(config);
    return instance;
  }
}
