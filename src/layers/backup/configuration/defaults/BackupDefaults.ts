import { BackupConfig } from '../../types/backup-types';

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
