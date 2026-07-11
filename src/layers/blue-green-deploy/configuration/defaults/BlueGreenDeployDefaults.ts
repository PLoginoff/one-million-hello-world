import { BlueGreenDeployConfig } from '../../types/blue-green-deploy-types';

export const DEFAULT_BLUEGREENDEPLOY_CONFIG: BlueGreenDeployConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
