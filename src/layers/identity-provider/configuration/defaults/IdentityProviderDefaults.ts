import { IdentityProviderConfig } from '../../types/identity-provider-types';

export const DEFAULT_IDENTITYPROVIDER_CONFIG: IdentityProviderConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
