import { ChaosEngineeringConfig } from '../../types/chaos-engineering-types';

export const DEFAULT_CHAOSENGINEERING_CONFIG: ChaosEngineeringConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
