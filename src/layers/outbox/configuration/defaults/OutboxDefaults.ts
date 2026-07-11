import { OutboxConfig } from '../../types/outbox-types';

export const DEFAULT_OUTBOX_CONFIG: OutboxConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
