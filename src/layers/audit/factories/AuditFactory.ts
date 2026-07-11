import { Audit } from '../implementations/Audit';
import { DefaultAuditStrategy, OptimizedAuditStrategy } from '../strategies/AuditStrategy';

export class AuditFactory {
  static createDefault(): Audit {
    const instance = new Audit();
    instance.configure({ strategy: new DefaultAuditStrategy() });
    return instance;
  }

  static createOptimized(): Audit {
    const instance = new Audit();
    instance.configure({ strategy: new OptimizedAuditStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Audit {
    const instance = new Audit();
    instance.configure(config);
    return instance;
  }
}
