import { Backup } from '../implementations/Backup';
import { DefaultBackupStrategy, OptimizedBackupStrategy } from '../strategies/BackupStrategy';

export class BackupFactory {
  static createDefault(): Backup {
    const instance = new Backup();
    instance.configure({ strategy: new DefaultBackupStrategy() });
    return instance;
  }

  static createOptimized(): Backup {
    const instance = new Backup();
    instance.configure({ strategy: new OptimizedBackupStrategy() });
    return instance;
  }

  static createWithConfig(config: Record<string, unknown>): Backup {
    const instance = new Backup();
    instance.configure(config);
    return instance;
  }
}
