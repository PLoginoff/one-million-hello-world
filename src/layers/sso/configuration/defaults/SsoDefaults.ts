import { SsoConfig } from '../../types/sso-types';

export const DEFAULT_SSO_CONFIG: SsoConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
