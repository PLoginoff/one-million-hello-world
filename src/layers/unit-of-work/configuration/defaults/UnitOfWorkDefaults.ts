import { UnitOfWorkConfig } from '../../types/unit-of-work-types';

export const DEFAULT_UNITOFWORK_CONFIG: UnitOfWorkConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
