import { EventSourcing } from '../implementations/EventSourcing';
import { DefaultEventSourcingStrategy, OptimizedEventSourcingStrategy } from '../strategies/EventSourcingStrategy';

export class EventSourcingFactory {
  static createDefault(): EventSourcing {
    const instance = new EventSourcing();
    instance.configure({ strategy: new DefaultEventSourcingStrategy() });
    return instance;
  }

  static createOptimized(): EventSourcing {
    const instance = new EventSourcing();
    instance.configure({ strategy: new OptimizedEventSourcingStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): EventSourcing {
    const instance = new EventSourcing();
    instance.configure(config);
    return instance;
  }
}
