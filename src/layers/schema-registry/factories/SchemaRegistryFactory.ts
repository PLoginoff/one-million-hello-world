import { SchemaRegistry } from '../implementations/SchemaRegistry';
import { DefaultSchemaRegistryStrategy, OptimizedSchemaRegistryStrategy } from '../strategies/SchemaRegistryStrategy';

export class SchemaRegistryFactory {
  static createDefault(): SchemaRegistry {
    const instance = new SchemaRegistry();
    instance.configure({ strategy: new DefaultSchemaRegistryStrategy() });
    return instance;
  }

  static createOptimized(): SchemaRegistry {
    const instance = new SchemaRegistry();
    instance.configure({ strategy: new OptimizedSchemaRegistryStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): SchemaRegistry {
    const instance = new SchemaRegistry();
    instance.configure(config);
    return instance;
  }
}
