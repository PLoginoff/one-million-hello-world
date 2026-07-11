import { SiemConfig } from '../../types/siem-types';

export const DEFAULT_SIEM_CONFIG: SiemConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
