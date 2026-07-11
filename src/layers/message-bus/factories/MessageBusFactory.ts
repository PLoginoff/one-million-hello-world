import { MessageBus } from '../implementations/MessageBus';
import { DefaultMessageBusStrategy, OptimizedMessageBusStrategy } from '../strategies/MessageBusStrategy';

export class MessageBusFactory {
  static createDefault(): MessageBus {
    const instance = new MessageBus();
    instance.configure({ strategy: new DefaultMessageBusStrategy() });
    return instance;
  }

  static createOptimized(): MessageBus {
    const instance = new MessageBus();
    instance.configure({ strategy: new OptimizedMessageBusStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): MessageBus {
    const instance = new MessageBus();
    instance.configure(config);
    return instance;
  }
}
