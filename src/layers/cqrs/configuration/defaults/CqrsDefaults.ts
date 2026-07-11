import { CqrsConfig } from '../../types/cqrs-types';

export const DEFAULT_CQRS_CONFIG: CqrsConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
