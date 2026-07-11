import { AuthorizationConfig } from '../../types/authorization-types';

export const DEFAULT_AUTHORIZATION_CONFIG: AuthorizationConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
