import { Outbox } from '../implementations/Outbox';
import { DefaultOutboxStrategy, OptimizedOutboxStrategy } from '../strategies/OutboxStrategy';

export class OutboxFactory {
  static createDefault(): Outbox {
    const instance = new Outbox();
    instance.configure({ strategy: new DefaultOutboxStrategy() });
    return instance;
  }

  static createOptimized(): Outbox {
    const instance = new Outbox();
    instance.configure({ strategy: new OptimizedOutboxStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Outbox {
    const instance = new Outbox();
    instance.configure(config);
    return instance;
  }
}
