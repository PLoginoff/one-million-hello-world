import { WafConfig } from '../../types/waf-types';

export const DEFAULT_WAF_CONFIG: WafConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
