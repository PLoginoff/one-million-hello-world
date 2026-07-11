import { EtlPipeline } from '../implementations/EtlPipeline';
import { DefaultEtlPipelineStrategy, OptimizedEtlPipelineStrategy } from '../strategies/EtlPipelineStrategy';

export class EtlPipelineFactory {
  static createDefault(): EtlPipeline {
    const instance = new EtlPipeline();
    instance.configure({ strategy: new DefaultEtlPipelineStrategy() });
    return instance;
  }

  static createOptimized(): EtlPipeline {
    const instance = new EtlPipeline();
    instance.configure({ strategy: new OptimizedEtlPipelineStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): EtlPipeline {
    const instance = new EtlPipeline();
    instance.configure(config);
    return instance;
  }
}
