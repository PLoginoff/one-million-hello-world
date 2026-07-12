import { ChaosEngineering } from '../implementations/ChaosEngineering';
import {
  DefaultChaosEngineeringStrategy,
  OptimizedChaosEngineeringStrategy,
} from '../strategies/ChaosEngineeringStrategy';

export class ChaosEngineeringFactory {
  static createDefault(): ChaosEngineering {
    const instance = new ChaosEngineering();
    instance.configure({ strategy: new DefaultChaosEngineeringStrategy() });
    return instance;
  }

  static createOptimized(): ChaosEngineering {
    const instance = new ChaosEngineering();
    instance.configure({ strategy: new OptimizedChaosEngineeringStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ChaosEngineering {
    const instance = new ChaosEngineering();
    instance.configure(config);
    return instance;
  }
}
