import { GitopsConfig } from '../../types/gitops-types';

export const DEFAULT_GITOPS_CONFIG: GitopsConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
