import { GraphqlConfig } from '../../types/graphql-types';
import { DEFAULT_GRAPHQL_CONFIG } from '../defaults/GraphqlDefaults';

export class GraphqlConfigBuilder {
  private _config: GraphqlConfig;

  constructor() {
    this._config = { ...DEFAULT_GRAPHQL_CONFIG };
  }

  withEnabled(enabled: boolean): GraphqlConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): GraphqlConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): GraphqlConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): GraphqlConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): GraphqlConfig {
    return { ...this._config };
  }
}
