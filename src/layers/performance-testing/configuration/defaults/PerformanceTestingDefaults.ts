import { PerformanceTestingConfig } from '../../types/performance-testing-types';

export const DEFAULT_PERFORMANCETESTING_CONFIG: PerformanceTestingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
