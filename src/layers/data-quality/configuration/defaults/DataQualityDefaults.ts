import { DataQualityConfig } from '../../types/data-quality-types';

export const DEFAULT_DATAQUALITY_CONFIG: DataQualityConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
