import { Graphql } from '../implementations/Graphql';
import { DefaultGraphqlStrategy, OptimizedGraphqlStrategy } from '../strategies/GraphqlStrategy';

export class GraphqlFactory {
  static createDefault(): Graphql {
    const instance = new Graphql();
    instance.configure({ strategy: new DefaultGraphqlStrategy() });
    return instance;
  }

  static createOptimized(): Graphql {
    const instance = new Graphql();
    instance.configure({ strategy: new OptimizedGraphqlStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Graphql {
    const instance = new Graphql();
    instance.configure(config);
    return instance;
  }
}
