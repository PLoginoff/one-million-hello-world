import { ApiGatewayConfig } from '../../types/api-gateway-types';
import { DEFAULT_APIGATEWAY_CONFIG } from '../defaults/ApiGatewayDefaults';

export class ApiGatewayConfigBuilder {
  private _config: ApiGatewayConfig;

  constructor() {
    this._config = { ...DEFAULT_APIGATEWAY_CONFIG };
  }

  withEnabled(enabled: boolean): ApiGatewayConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ApiGatewayConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ApiGatewayConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ApiGatewayConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ApiGatewayConfig {
    return { ...this._config };
  }
}
