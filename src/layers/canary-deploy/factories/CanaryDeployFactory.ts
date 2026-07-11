import { CanaryDeploy } from '../implementations/CanaryDeploy';
import { DefaultCanaryDeployStrategy, OptimizedCanaryDeployStrategy } from '../strategies/CanaryDeployStrategy';

export class CanaryDeployFactory {
  static createDefault(): CanaryDeploy {
    const instance = new CanaryDeploy();
    instance.configure({ strategy: new DefaultCanaryDeployStrategy() });
    return instance;
  }

  static createOptimized(): CanaryDeploy {
    const instance = new CanaryDeploy();
    instance.configure({ strategy: new OptimizedCanaryDeployStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): CanaryDeploy {
    const instance = new CanaryDeploy();
    instance.configure(config);
    return instance;
  }
}
