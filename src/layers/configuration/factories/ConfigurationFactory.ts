import { Configuration } from '../implementations/Configuration';
import { DefaultConfigurationStrategy, OptimizedConfigurationStrategy } from '../strategies/ConfigurationStrategy';

export class ConfigurationFactory {
  static createDefault(): Configuration {
    const instance = new Configuration();
    instance.configure({ strategy: new DefaultConfigurationStrategy() });
    return instance;
  }

  static createOptimized(): Configuration {
    const instance = new Configuration();
    instance.configure({ strategy: new OptimizedConfigurationStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Configuration {
    const instance = new Configuration();
    instance.configure(config);
    return instance;
  }
}
