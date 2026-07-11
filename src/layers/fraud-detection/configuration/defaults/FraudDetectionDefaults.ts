import { FraudDetectionConfig } from '../../types/fraud-detection-types';

export const DEFAULT_FRAUDDETECTION_CONFIG: FraudDetectionConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
