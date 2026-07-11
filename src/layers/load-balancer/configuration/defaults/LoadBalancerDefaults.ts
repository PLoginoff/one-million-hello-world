import { LoadBalancerConfig } from '../../types/load-balancer-types';

export const DEFAULT_LOADBALANCER_CONFIG: LoadBalancerConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
