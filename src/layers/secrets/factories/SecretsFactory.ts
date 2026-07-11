import { Secrets } from '../implementations/Secrets';
import { DefaultSecretsStrategy, OptimizedSecretsStrategy } from '../strategies/SecretsStrategy';

export class SecretsFactory {
  static createDefault(): Secrets {
    const instance = new Secrets();
    instance.configure({ strategy: new DefaultSecretsStrategy() });
    return instance;
  }

  static createOptimized(): Secrets {
    const instance = new Secrets();
    instance.configure({ strategy: new OptimizedSecretsStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Secrets {
    const instance = new Secrets();
    instance.configure(config);
    return instance;
  }
}
