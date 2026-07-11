import { DataLakeConfig } from '../../types/data-lake-types';

export const DEFAULT_DATALAKE_CONFIG: DataLakeConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
