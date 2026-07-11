import { WebsocketConfig } from '../../types/websocket-types';

export const DEFAULT_WEBSOCKET_CONFIG: WebsocketConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
