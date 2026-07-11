import { Authorization } from '../implementations/Authorization';
import { DefaultAuthorizationStrategy, OptimizedAuthorizationStrategy } from '../strategies/AuthorizationStrategy';

export class AuthorizationFactory {
  static createDefault(): Authorization {
    const instance = new Authorization();
    instance.configure({ strategy: new DefaultAuthorizationStrategy() });
    return instance;
  }

  static createOptimized(): Authorization {
    const instance = new Authorization();
    instance.configure({ strategy: new OptimizedAuthorizationStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Authorization {
    const instance = new Authorization();
    instance.configure(config);
    return instance;
  }
}
