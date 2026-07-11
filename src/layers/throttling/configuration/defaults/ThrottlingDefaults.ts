import { ThrottlingConfig } from '../../types/throttling-types';

export const DEFAULT_THROTTLING_CONFIG: ThrottlingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
