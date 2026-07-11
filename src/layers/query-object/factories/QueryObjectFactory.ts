import { QueryObject } from '../implementations/QueryObject';
import { DefaultQueryObjectStrategy, OptimizedQueryObjectStrategy } from '../strategies/QueryObjectStrategy';

export class QueryObjectFactory {
  static createDefault(): QueryObject {
    const instance = new QueryObject();
    instance.configure({ strategy: new DefaultQueryObjectStrategy() });
    return instance;
  }

  static createOptimized(): QueryObject {
    const instance = new QueryObject();
    instance.configure({ strategy: new OptimizedQueryObjectStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): QueryObject {
    const instance = new QueryObject();
    instance.configure(config);
    return instance;
  }
}
