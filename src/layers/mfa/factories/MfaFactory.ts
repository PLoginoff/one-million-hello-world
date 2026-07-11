import { Mfa } from '../implementations/Mfa';
import { DefaultMfaStrategy, OptimizedMfaStrategy } from '../strategies/MfaStrategy';

export class MfaFactory {
  static createDefault(): Mfa {
    const instance = new Mfa();
    instance.configure({ strategy: new DefaultMfaStrategy() });
    return instance;
  }

  static createOptimized(): Mfa {
    const instance = new Mfa();
    instance.configure({ strategy: new OptimizedMfaStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Mfa {
    const instance = new Mfa();
    instance.configure(config);
    return instance;
  }
}
