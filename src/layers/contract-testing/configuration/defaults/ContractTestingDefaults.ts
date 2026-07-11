import { ContractTestingConfig } from '../../types/contract-testing-types';

export const DEFAULT_CONTRACTTESTING_CONFIG: ContractTestingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
