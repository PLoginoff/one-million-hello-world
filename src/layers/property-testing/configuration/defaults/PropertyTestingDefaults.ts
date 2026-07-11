import { PropertyTestingConfig } from '../../types/property-testing-types';

export const DEFAULT_PROPERTYTESTING_CONFIG: PropertyTestingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
