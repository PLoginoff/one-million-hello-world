import { DeadLetterConfig } from '../../types/dead-letter-types';

export const DEFAULT_DEADLETTER_CONFIG: DeadLetterConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
