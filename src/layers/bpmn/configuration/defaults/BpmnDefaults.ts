import { BpmnConfig } from '../../types/bpmn-types';

export const DEFAULT_BPMN_CONFIG: BpmnConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
