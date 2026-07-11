import { MfaConfig } from '../../types/mfa-types';

export const DEFAULT_MFA_CONFIG: MfaConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
