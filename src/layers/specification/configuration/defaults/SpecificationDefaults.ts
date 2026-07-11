import { SpecificationConfig } from '../../types/specification-types';

export const DEFAULT_SPECIFICATION_CONFIG: SpecificationConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
