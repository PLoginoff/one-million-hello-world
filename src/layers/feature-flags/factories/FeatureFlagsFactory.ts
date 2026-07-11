import { FeatureFlags } from '../implementations/FeatureFlags';
import { DefaultFeatureFlagsStrategy, OptimizedFeatureFlagsStrategy } from '../strategies/FeatureFlagsStrategy';

export class FeatureFlagsFactory {
  static createDefault(): FeatureFlags {
    const instance = new FeatureFlags();
    instance.configure({ strategy: new DefaultFeatureFlagsStrategy() });
    return instance;
  }

  static createOptimized(): FeatureFlags {
    const instance = new FeatureFlags();
    instance.configure({ strategy: new OptimizedFeatureFlagsStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): FeatureFlags {
    const instance = new FeatureFlags();
    instance.configure(config);
    return instance;
  }
}
