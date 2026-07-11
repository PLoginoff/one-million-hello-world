import { SecretsConfig } from '../../types/secrets-types';

export const DEFAULT_SECRETS_CONFIG: SecretsConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
