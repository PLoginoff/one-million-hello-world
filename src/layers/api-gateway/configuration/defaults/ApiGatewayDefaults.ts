import { ApiGatewayConfig } from '../../types/api-gateway-types';

export const DEFAULT_APIGATEWAY_CONFIG: ApiGatewayConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
