import { DeadLetter } from '../implementations/DeadLetter';
import { DefaultDeadLetterStrategy, OptimizedDeadLetterStrategy } from '../strategies/DeadLetterStrategy';

export class DeadLetterFactory {
  static createDefault(): DeadLetter {
    const instance = new DeadLetter();
    instance.configure({ strategy: new DefaultDeadLetterStrategy() });
    return instance;
  }

  static createOptimized(): DeadLetter {
    const instance = new DeadLetter();
    instance.configure({ strategy: new OptimizedDeadLetterStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): DeadLetter {
    const instance = new DeadLetter();
    instance.configure(config);
    return instance;
  }
}
