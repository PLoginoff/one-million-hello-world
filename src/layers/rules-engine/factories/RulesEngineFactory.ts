import { RulesEngine } from '../implementations/RulesEngine';
import { DefaultRulesEngineStrategy, OptimizedRulesEngineStrategy } from '../strategies/RulesEngineStrategy';

export class RulesEngineFactory {
  static createDefault(): RulesEngine {
    const instance = new RulesEngine();
    instance.configure({ strategy: new DefaultRulesEngineStrategy() });
    return instance;
  }

  static createOptimized(): RulesEngine {
    const instance = new RulesEngine();
    instance.configure({ strategy: new OptimizedRulesEngineStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): RulesEngine {
    const instance = new RulesEngine();
    instance.configure(config);
    return instance;
  }
}
