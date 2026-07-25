/**
 * Bpmn Configuration Validator
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class BpmnConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout <
        {
          minTimeout: 1000,
          maxTimeout: 300000,
          minRetries: 0,
          maxRetries: 10,
          maxConcurrentExecutions: 1000,
          maxCacheTtlMs: 3600000,
        }.minTimeout ||
      timeout >
        {
          minTimeout: 1000,
          maxTimeout: 300000,
          minRetries: 0,
          maxRetries: 10,
          maxConcurrentExecutions: 1000,
          maxCacheTtlMs: 3600000,
        }.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' +
          {
            minTimeout: 1000,
            maxTimeout: 300000,
            minRetries: 0,
            maxRetries: 10,
            maxConcurrentExecutions: 1000,
            maxCacheTtlMs: 3600000,
          }.minTimeout +
          ' and ' +
          {
            minTimeout: 1000,
            maxTimeout: 300000,
            minRetries: 0,
            maxRetries: 10,
            maxConcurrentExecutions: 1000,
            maxCacheTtlMs: 3600000,
          }.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries <
        {
          minTimeout: 1000,
          maxTimeout: 300000,
          minRetries: 0,
          maxRetries: 10,
          maxConcurrentExecutions: 1000,
          maxCacheTtlMs: 3600000,
        }.minRetries ||
      retries >
        {
          minTimeout: 1000,
          maxTimeout: 300000,
          minRetries: 0,
          maxRetries: 10,
          maxConcurrentExecutions: 1000,
          maxCacheTtlMs: 3600000,
        }.maxRetries
    ) {
      errors.push(
        'retries must be between ' +
          {
            minTimeout: 1000,
            maxTimeout: 300000,
            minRetries: 0,
            maxRetries: 10,
            maxConcurrentExecutions: 1000,
            maxCacheTtlMs: 3600000,
          }.minRetries +
          ' and ' +
          {
            minTimeout: 1000,
            maxTimeout: 300000,
            minRetries: 0,
            maxRetries: 10,
            maxConcurrentExecutions: 1000,
            maxCacheTtlMs: 3600000,
          }.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (
      typeof strategy === 'string' &&
      !(['default', 'fast', 'reliable', 'cached', 'batch'] as string[]).includes(strategy)
    ) {
      errors.push('strategy must be one of: ' + ['default', 'fast', 'reliable', 'cached', 'batch'].join(', '));
    }

    const logLevel = config.logLevel as string;
    if (typeof logLevel === 'string' && !['debug', 'info', 'warn', 'error'].includes(logLevel)) {
      warnings.push('logLevel should be one of: debug, info, warn, error');
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  validateOrThrow(config: Record<string, unknown>): void {
    const result = this.validate(config);
    if (!result.valid) {
      throw new Error('Invalid bpmn configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): Record<string, unknown> {
    return {
      enabled: true,
      timeout: 30000,
      retries: 3,
      logLevel: 'info',
      strategy: 'default',
      maxConcurrentExecutions: 100,
      cacheEnabled: true,
      cacheTtlMs: 60000,
      metricsEnabled: true,
      healthCheckEnabled: true,
      healthCheckIntervalMs: 30000,
    };
  }
}
