import { BlueGreenDeployConfig } from '../../types/blue-green-deploy-types';

export class BlueGreenDeployConfigValidator {
  validate(config: Partial<BlueGreenDeployConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.timeout !== undefined && config.timeout < 0) {
      errors.push('timeout must be non-negative');
    }

    if (config.retries !== undefined && config.retries < 0) {
      errors.push('retries must be non-negative');
    }

    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (config.logLevel !== undefined && !validLogLevels.includes(config.logLevel)) {
      errors.push('logLevel must be one of debug, info, warn, error');
    }

    return { valid: errors.length === 0, errors };
  }
}
