import { Migrations } from '../implementations/Migrations';
import { DefaultMigrationsStrategy, OptimizedMigrationsStrategy } from '../strategies/MigrationsStrategy';

export class MigrationsFactory {
  static createDefault(): Migrations {
    const instance = new Migrations();
    instance.configure({ strategy: new DefaultMigrationsStrategy() });
    return instance;
  }

  static createOptimized(): Migrations {
    const instance = new Migrations();
    instance.configure({ strategy: new OptimizedMigrationsStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Migrations {
    const instance = new Migrations();
    instance.configure(config);
    return instance;
  }
}
