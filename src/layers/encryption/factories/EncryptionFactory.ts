import { Encryption } from '../implementations/Encryption';
import { DefaultEncryptionStrategy, OptimizedEncryptionStrategy } from '../strategies/EncryptionStrategy';

export class EncryptionFactory {
  static createDefault(): Encryption {
    const instance = new Encryption();
    instance.configure({ strategy: new DefaultEncryptionStrategy() });
    return instance;
  }

  static createOptimized(): Encryption {
    const instance = new Encryption();
    instance.configure({ strategy: new OptimizedEncryptionStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Encryption {
    const instance = new Encryption();
    instance.configure(config);
    return instance;
  }
}
