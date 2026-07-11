import { MutationTestingConfig } from '../../types/mutation-testing-types';

export const DEFAULT_MUTATIONTESTING_CONFIG: MutationTestingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
