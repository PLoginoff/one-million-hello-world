import { MessageBusConfig } from '../../types/message-bus-types';

export const DEFAULT_MESSAGEBUS_CONFIG: MessageBusConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
