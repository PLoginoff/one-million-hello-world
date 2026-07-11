import { DataWarehouseConfig } from '../../types/data-warehouse-types';

export const DEFAULT_DATAWAREHOUSE_CONFIG: DataWarehouseConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
