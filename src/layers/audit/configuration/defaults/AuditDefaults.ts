import { AuditConfig } from '../../types/audit-types';

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
