import { QueryObjectConfig } from '../../types/query-object-types';

export const DEFAULT_QUERYOBJECT_CONFIG: QueryObjectConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
