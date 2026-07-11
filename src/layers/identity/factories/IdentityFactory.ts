import { Identity } from '../implementations/Identity';
import { DefaultIdentityStrategy, OptimizedIdentityStrategy } from '../strategies/IdentityStrategy';

export class IdentityFactory {
  static createDefault(): Identity {
    const instance = new Identity();
    instance.configure({ strategy: new DefaultIdentityStrategy() });
    return instance;
  }

  static createOptimized(): Identity {
    const instance = new Identity();
    instance.configure({ strategy: new OptimizedIdentityStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Identity {
    const instance = new Identity();
    instance.configure(config);
    return instance;
  }
}
