import { WriteModelConfig } from '../../types/write-model-types';

export const DEFAULT_WRITEMODEL_CONFIG: WriteModelConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
