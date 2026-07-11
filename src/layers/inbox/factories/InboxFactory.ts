import { Inbox } from '../implementations/Inbox';
import { DefaultInboxStrategy, OptimizedInboxStrategy } from '../strategies/InboxStrategy';

export class InboxFactory {
  static createDefault(): Inbox {
    const instance = new Inbox();
    instance.configure({ strategy: new DefaultInboxStrategy() });
    return instance;
  }

  static createOptimized(): Inbox {
    const instance = new Inbox();
    instance.configure({ strategy: new OptimizedInboxStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Inbox {
    const instance = new Inbox();
    instance.configure(config);
    return instance;
  }
}
