import { JwtValidationConfig } from '../../types/jwt-validation-types';

export const DEFAULT_JWTVALIDATION_CONFIG: JwtValidationConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
