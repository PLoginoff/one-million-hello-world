import { ReadModelConfig } from '../../types/read-model-types';

export const DEFAULT_READMODEL_CONFIG: ReadModelConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
