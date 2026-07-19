/**
 * CORS Strategy
 *
 * Handles CORS headers and preflight requests.
 */

import { CorsConfig } from '../../types/security-types';

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
}

export class CorsStrategy {
  private readonly _config: CorsConfig;

  constructor(config: CorsConfig) {
    this._config = config;
  }

  getName(): string {
    return 'CORS';
  }

  handlePreflight(origin: string, method: string): CorsResult {
    if (!this._isOriginAllowed(origin)) {
      return { allowed: false, headers: {} };
    }

    if (!this._config.allowedMethods.includes(method.toUpperCase())) {
      return { allowed: false, headers: {} };
    }

    return {
      allowed: true,
      headers: this._buildHeaders(origin),
    };
  }

  handleRequest(origin: string): CorsResult {
    if (!this._isOriginAllowed(origin)) {
      return { allowed: false, headers: {} };
    }

    return {
      allowed: true,
      headers: this._buildHeaders(origin),
    };
  }

  private _isOriginAllowed(origin: string): boolean {
    if (this._config.allowedOrigins.includes('*')) return true;
    return this._config.allowedOrigins.includes(origin);
  }

  private _buildHeaders(origin: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': this._config.allowedOrigins.includes('*') ? '*' : origin,
      'Access-Control-Allow-Methods': this._config.allowedMethods.join(', '),
      'Access-Control-Allow-Headers': this._config.allowedHeaders.join(', '),
    };

    if (this._config.credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    if (this._config.exposedHeaders.length > 0) {
      headers['Access-Control-Expose-Headers'] = this._config.exposedHeaders.join(', ');
    }

    if (this._config.maxAge > 0) {
      headers['Access-Control-Max-Age'] = String(this._config.maxAge);
    }

    return headers;
  }

  getConfig(): CorsConfig {
    return { ...this._config };
  }
}
