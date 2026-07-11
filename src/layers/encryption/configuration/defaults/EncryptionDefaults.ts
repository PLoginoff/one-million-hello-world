import { EncryptionConfig } from '../../types/encryption-types';

export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
