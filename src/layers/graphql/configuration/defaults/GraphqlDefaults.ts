import { GraphqlConfig } from '../../types/graphql-types';

export const DEFAULT_GRAPHQL_CONFIG: GraphqlConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
