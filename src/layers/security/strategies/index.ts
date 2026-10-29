export { SecurityDefaultStrategy, ISecurityStrategy as ISecurityLegacyStrategy } from './DefaultStrategy';
export { SecurityFastStrategy } from './FastStrategy';
export { SecurityReliableStrategy } from './ReliableStrategy';
export { SecurityCachedStrategy } from './CachedStrategy';
export { SecurityBatchStrategy } from './BatchStrategy';
export {
  SecurityLoggingStrategy,
  SecurityLoggingStrategyOptions,
  SecurityLogger as SecurityLegacyLogger,
  SecurityLoggingStrategyFactory,
} from './LoggingStrategy';
export {
  SecurityMetricsStrategy,
  SecurityMetricsStrategyOptions,
  SecurityMetricsStrategyFactory,
} from './MetricsStrategy';

// New Strategy Pattern exports
export { ISecurityStrategy, SecurityStrategyContext, StrategyResult } from './ISecurityStrategy';
export { DefaultSecurityStrategy } from './DefaultSecurityStrategy';
export {
  LoggingSecurityStrategy,
  LoggingSecurityStrategyOptions,
  SecurityLogger,
  LoggingSecurityStrategyFactory,
} from './LoggingSecurityStrategy';
export {
  MetricsSecurityStrategy,
  MetricsSecurityStrategyOptions,
  MetricsSecurityStrategyFactory,
} from './MetricsSecurityStrategy';
