import { EdgeCacheConfig } from '../../types/edge-cache-types';

export const DEFAULT_EDGECACHE_CONFIG: EdgeCacheConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
