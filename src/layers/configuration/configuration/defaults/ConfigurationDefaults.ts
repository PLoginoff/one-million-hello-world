import { ConfigurationConfig } from '../../types/configuration-types';

export const DEFAULT_CONFIGURATION_CONFIG: ConfigurationConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
