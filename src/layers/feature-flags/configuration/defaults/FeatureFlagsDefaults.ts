import { FeatureFlagsConfig } from '../../types/feature-flags-types';

export const DEFAULT_FEATUREFLAGS_CONFIG: FeatureFlagsConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
