import { EventSourcingConfig } from '../../types/event-sourcing-types';

export const DEFAULT_EVENTSOURCING_CONFIG: EventSourcingConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
