import { RulesEngineConfig } from '../../types/rules-engine-types';

export const DEFAULT_RULESENGINE_CONFIG: RulesEngineConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
