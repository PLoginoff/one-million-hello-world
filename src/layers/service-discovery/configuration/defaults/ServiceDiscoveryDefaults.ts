import { ServiceDiscoveryConfig } from '../../types/service-discovery-types';

export const DEFAULT_SERVICEDISCOVERY_CONFIG: ServiceDiscoveryConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
