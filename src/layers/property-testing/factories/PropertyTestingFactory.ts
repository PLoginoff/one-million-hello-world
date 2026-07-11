import { PropertyTesting } from '../implementations/PropertyTesting';
import { DefaultPropertyTestingStrategy, OptimizedPropertyTestingStrategy } from '../strategies/PropertyTestingStrategy';

export class PropertyTestingFactory {
  static createDefault(): PropertyTesting {
    const instance = new PropertyTesting();
    instance.configure({ strategy: new DefaultPropertyTestingStrategy() });
    return instance;
  }

  static createOptimized(): PropertyTesting {
    const instance = new PropertyTesting();
    instance.configure({ strategy: new OptimizedPropertyTestingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): PropertyTesting {
    const instance = new PropertyTesting();
    instance.configure(config);
    return instance;
  }
}
