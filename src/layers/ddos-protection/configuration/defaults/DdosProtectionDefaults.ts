import { DdosProtectionConfig } from '../../types/ddos-protection-types';

export const DEFAULT_DDOSPROTECTION_CONFIG: DdosProtectionConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
