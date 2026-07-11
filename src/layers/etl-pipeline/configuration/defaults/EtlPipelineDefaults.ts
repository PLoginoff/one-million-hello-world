import { EtlPipelineConfig } from '../../types/etl-pipeline-types';

export const DEFAULT_ETLPIPELINE_CONFIG: EtlPipelineConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
