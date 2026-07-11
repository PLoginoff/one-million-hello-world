import { Snapshot } from '../implementations/Snapshot';
import { DefaultSnapshotStrategy, OptimizedSnapshotStrategy } from '../strategies/SnapshotStrategy';

export class SnapshotFactory {
  static createDefault(): Snapshot {
    const instance = new Snapshot();
    instance.configure({ strategy: new DefaultSnapshotStrategy() });
    return instance;
  }

  static createOptimized(): Snapshot {
    const instance = new Snapshot();
    instance.configure({ strategy: new OptimizedSnapshotStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Snapshot {
    const instance = new Snapshot();
    instance.configure(config);
    return instance;
  }
}
