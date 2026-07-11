import { IdentityConfig } from '../../types/identity-types';

export const DEFAULT_IDENTITY_CONFIG: IdentityConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
