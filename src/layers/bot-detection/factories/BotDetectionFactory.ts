import { BotDetection } from '../implementations/BotDetection';
import { DefaultBotDetectionStrategy, OptimizedBotDetectionStrategy } from '../strategies/BotDetectionStrategy';

export class BotDetectionFactory {
  static createDefault(): BotDetection {
    const instance = new BotDetection();
    instance.configure({ strategy: new DefaultBotDetectionStrategy() });
    return instance;
  }

  static createOptimized(): BotDetection {
    const instance = new BotDetection();
    instance.configure({ strategy: new OptimizedBotDetectionStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): BotDetection {
    const instance = new BotDetection();
    instance.configure(config);
    return instance;
  }
}
