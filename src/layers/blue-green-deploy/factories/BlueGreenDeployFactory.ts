import { BlueGreenDeploy } from '../implementations/BlueGreenDeploy';
import {
  DefaultBlueGreenDeployStrategy,
  OptimizedBlueGreenDeployStrategy,
} from '../strategies/BlueGreenDeployStrategy';

export class BlueGreenDeployFactory {
  static createDefault(): BlueGreenDeploy {
    const instance = new BlueGreenDeploy();
    instance.configure({ strategy: new DefaultBlueGreenDeployStrategy() });
    return instance;
  }

  static createOptimized(): BlueGreenDeploy {
    const instance = new BlueGreenDeploy();
    instance.configure({ strategy: new OptimizedBlueGreenDeployStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): BlueGreenDeploy {
    const instance = new BlueGreenDeploy();
    instance.configure(config);
    return instance;
  }
}
