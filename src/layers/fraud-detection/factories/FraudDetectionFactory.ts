import { FraudDetection } from '../implementations/FraudDetection';
import { DefaultFraudDetectionStrategy, OptimizedFraudDetectionStrategy } from '../strategies/FraudDetectionStrategy';

export class FraudDetectionFactory {
  static createDefault(): FraudDetection {
    const instance = new FraudDetection();
    instance.configure({ strategy: new DefaultFraudDetectionStrategy() });
    return instance;
  }

  static createOptimized(): FraudDetection {
    const instance = new FraudDetection();
    instance.configure({ strategy: new OptimizedFraudDetectionStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): FraudDetection {
    const instance = new FraudDetection();
    instance.configure(config);
    return instance;
  }
}
