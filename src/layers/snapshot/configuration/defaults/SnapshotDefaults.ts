import { SnapshotConfig } from '../../types/snapshot-types';

export const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
