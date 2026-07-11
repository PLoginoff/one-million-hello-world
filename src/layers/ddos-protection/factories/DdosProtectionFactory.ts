import { DdosProtection } from '../implementations/DdosProtection';
import { DefaultDdosProtectionStrategy, OptimizedDdosProtectionStrategy } from '../strategies/DdosProtectionStrategy';

export class DdosProtectionFactory {
  static createDefault(): DdosProtection {
    const instance = new DdosProtection();
    instance.configure({ strategy: new DefaultDdosProtectionStrategy() });
    return instance;
  }

  static createOptimized(): DdosProtection {
    const instance = new DdosProtection();
    instance.configure({ strategy: new OptimizedDdosProtectionStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): DdosProtection {
    const instance = new DdosProtection();
    instance.configure(config);
    return instance;
  }
}
