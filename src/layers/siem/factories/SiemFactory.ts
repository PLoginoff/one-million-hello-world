import { Siem } from '../implementations/Siem';
import { DefaultSiemStrategy, OptimizedSiemStrategy } from '../strategies/SiemStrategy';

export class SiemFactory {
  static createDefault(): Siem {
    const instance = new Siem();
    instance.configure({ strategy: new DefaultSiemStrategy() });
    return instance;
  }

  static createOptimized(): Siem {
    const instance = new Siem();
    instance.configure({ strategy: new OptimizedSiemStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Siem {
    const instance = new Siem();
    instance.configure(config);
    return instance;
  }
}
