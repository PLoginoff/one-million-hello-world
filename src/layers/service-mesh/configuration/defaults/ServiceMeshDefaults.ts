import { ServiceMeshConfig } from '../../types/service-mesh-types';

export const DEFAULT_SERVICEMESH_CONFIG: ServiceMeshConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
