import { BotDetectionConfig } from '../../types/bot-detection-types';

export const DEFAULT_BOTDETECTION_CONFIG: BotDetectionConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
