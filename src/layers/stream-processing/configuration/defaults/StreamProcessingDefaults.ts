import { StreamProcessingConfig } from '../../types/stream-processing-types';

export const DEFAULT_STREAMPROCESSING_CONFIG: StreamProcessingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
