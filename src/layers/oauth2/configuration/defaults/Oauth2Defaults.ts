import { Oauth2Config } from '../../types/oauth2-types';

export const DEFAULT_OAUTH2_CONFIG: Oauth2Config = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
