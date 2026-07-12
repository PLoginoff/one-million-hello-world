import { StreamProcessing } from '../implementations/StreamProcessing';
import {
  DefaultStreamProcessingStrategy,
  OptimizedStreamProcessingStrategy,
} from '../strategies/StreamProcessingStrategy';

export class StreamProcessingFactory {
  static createDefault(): StreamProcessing {
    const instance = new StreamProcessing();
    instance.configure({ strategy: new DefaultStreamProcessingStrategy() });
    return instance;
  }

  static createOptimized(): StreamProcessing {
    const instance = new StreamProcessing();
    instance.configure({ strategy: new OptimizedStreamProcessingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): StreamProcessing {
    const instance = new StreamProcessing();
    instance.configure(config);
    return instance;
  }
}
