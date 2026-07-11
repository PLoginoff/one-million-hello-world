import { InboxConfig } from '../../types/inbox-types';

export const DEFAULT_INBOX_CONFIG: InboxConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
