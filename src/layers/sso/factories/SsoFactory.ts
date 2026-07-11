import { Sso } from '../implementations/Sso';
import { DefaultSsoStrategy, OptimizedSsoStrategy } from '../strategies/SsoStrategy';

export class SsoFactory {
  static createDefault(): Sso {
    const instance = new Sso();
    instance.configure({ strategy: new DefaultSsoStrategy() });
    return instance;
  }

  static createOptimized(): Sso {
    const instance = new Sso();
    instance.configure({ strategy: new OptimizedSsoStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Sso {
    const instance = new Sso();
    instance.configure(config);
    return instance;
  }
}
