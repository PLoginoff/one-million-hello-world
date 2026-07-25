/**
 * DataTransformation Default Configuration Values
 */

export const DataTransformationDEFAULTS = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info' as const,
  strategy: 'default' as const,
  maxConcurrentExecutions: 100,
  cacheEnabled: true,
  cacheTtlMs: 60000,
  metricsEnabled: true,
  healthCheckEnabled: true,
  healthCheckIntervalMs: 30000,
} as const;

export const DataTransformationLIMITS = {
  minTimeout: 1000,
  maxTimeout: 300000,
  minRetries: 0,
  maxRetries: 10,
  maxConcurrentExecutions: 1000,
  maxCacheTtlMs: 3600000,
} as const;

export const DataTransformationSTRATEGIES = ['default', 'fast', 'reliable', 'cached', 'batch'] as const;
