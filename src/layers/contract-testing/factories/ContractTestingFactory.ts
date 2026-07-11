import { ContractTesting } from '../implementations/ContractTesting';
import { DefaultContractTestingStrategy, OptimizedContractTestingStrategy } from '../strategies/ContractTestingStrategy';

export class ContractTestingFactory {
  static createDefault(): ContractTesting {
    const instance = new ContractTesting();
    instance.configure({ strategy: new DefaultContractTestingStrategy() });
    return instance;
  }

  static createOptimized(): ContractTesting {
    const instance = new ContractTesting();
    instance.configure({ strategy: new OptimizedContractTestingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): ContractTesting {
    const instance = new ContractTesting();
    instance.configure(config);
    return instance;
  }
}
