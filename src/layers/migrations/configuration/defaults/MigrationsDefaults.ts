import { MigrationsConfig } from '../../types/migrations-types';

export const DEFAULT_MIGRATIONS_CONFIG: MigrationsConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
