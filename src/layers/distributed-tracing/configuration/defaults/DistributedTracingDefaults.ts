import { DistributedTracingConfig } from '../../types/distributed-tracing-types';

export const DEFAULT_DISTRIBUTEDTRACING_CONFIG: DistributedTracingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
