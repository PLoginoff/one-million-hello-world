import { CanaryDeployConfig } from '../../types/canary-deploy-types';

export const DEFAULT_CANARYDEPLOY_CONFIG: CanaryDeployConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
