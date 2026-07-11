import { PolicyEngine } from '../implementations/PolicyEngine';
import { DefaultPolicyEngineStrategy, OptimizedPolicyEngineStrategy } from '../strategies/PolicyEngineStrategy';

export class PolicyEngineFactory {
  static createDefault(): PolicyEngine {
    const instance = new PolicyEngine();
    instance.configure({ strategy: new DefaultPolicyEngineStrategy() });
    return instance;
  }

  static createOptimized(): PolicyEngine {
    const instance = new PolicyEngine();
    instance.configure({ strategy: new OptimizedPolicyEngineStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): PolicyEngine {
    const instance = new PolicyEngine();
    instance.configure(config);
    return instance;
  }
}
