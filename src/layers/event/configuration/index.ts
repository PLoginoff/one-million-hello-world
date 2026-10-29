/**
 * Event Configuration Layer
 *
 * Configuration management for the event system.
 */

export { EventBusConfig, EventBusConfigOptions } from './EventBusConfig';
export { ConfigValidator, LegacyValidationError, LegacyValidationResult } from './ConfigValidator';
export { ConfigLoader, ConfigSource, LoadedConfig } from './ConfigLoader';

// Builders
export { EventConfigBuilder, type EventConfiguration, type EventConfigProfile } from './builders/EventConfigBuilder';

// Defaults
export {
  DEFAULT_EVENT_BUS_CONFIG,
  EVENT_CONFIG_LIMITS,
  DEFAULT_ADAPTER_CONFIGS,
  DEFAULT_STRATEGY_CONFIGS,
  DEFAULT_METRICS_CONFIG,
  DEFAULT_HEALTH_CHECK_CONFIG,
  DEFAULT_LOGGING_CONFIG,
  PROFILE_DEFAULTS,
  VALID_LOG_LEVELS,
  VALID_SERIALIZATION_FORMATS,
  VALID_ADAPTER_TYPES,
  VALID_STRATEGY_NAMES,
  VALID_PROFILES,
} from './defaults/EventDefaults';

// Validators
export { EventConfigValidator, type ValidationResult, type ValidationError, type ValidationWarning } from './validators/EventConfigValidator';