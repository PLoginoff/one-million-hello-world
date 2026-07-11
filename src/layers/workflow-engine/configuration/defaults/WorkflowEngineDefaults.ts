import { WorkflowEngineConfig } from '../../types/workflow-engine-types';

export const DEFAULT_WORKFLOWENGINE_CONFIG: WorkflowEngineConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
