import { MutationTesting } from '../implementations/MutationTesting';
import {
  DefaultMutationTestingStrategy,
  OptimizedMutationTestingStrategy,
} from '../strategies/MutationTestingStrategy';

export class MutationTestingFactory {
  static createDefault(): MutationTesting {
    const instance = new MutationTesting();
    instance.configure({ strategy: new DefaultMutationTestingStrategy() });
    return instance;
  }

  static createOptimized(): MutationTesting {
    const instance = new MutationTesting();
    instance.configure({ strategy: new OptimizedMutationTestingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): MutationTesting {
    const instance = new MutationTesting();
    instance.configure(config);
    return instance;
  }
}
