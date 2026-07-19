/**
 * Helmet Strategy
 *
 * Sets security-related HTTP headers.
 */

export interface HelmetConfig {
  contentSecurityPolicy?: string;
  xContentTypeOptions?: boolean;
  xFrameOptions?: string;
  strictTransportSecurity?: string;
  xXssProtection?: boolean;
  referrerPolicy?: string;
  noSniff?: boolean;
}

export class HelmetStrategy {
  private readonly _config: HelmetConfig;

  constructor(config: HelmetConfig = {}) {
    this._config = {
      xContentTypeOptions: true,
      xFrameOptions: 'DENY',
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      xXssProtection: true,
      referrerPolicy: 'no-referrer',
      noSniff: true,
      ...config,
    };
  }

  getName(): string {
    return 'HELMET';
  }

  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this._config.contentSecurityPolicy !== undefined) {
      headers['Content-Security-Policy'] = this._config.contentSecurityPolicy;
    }

    if (this._config.xContentTypeOptions === true) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    if (this._config.xFrameOptions !== undefined) {
      headers['X-Frame-Options'] = this._config.xFrameOptions;
    }

    if (this._config.strictTransportSecurity !== undefined) {
      headers['Strict-Transport-Security'] = this._config.strictTransportSecurity;
    }

    if (this._config.xXssProtection === true) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }

    if (this._config.referrerPolicy !== undefined) {
      headers['Referrer-Policy'] = this._config.referrerPolicy;
    }

    return headers;
  }

  getConfig(): HelmetConfig {
    return { ...this._config };
  }
}
