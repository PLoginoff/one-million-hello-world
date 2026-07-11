import { PolicyEngineConfig } from '../../types/policy-engine-types';

export const DEFAULT_POLICYENGINE_CONFIG: PolicyEngineConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
