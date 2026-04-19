/**
 * Decorators Module
 * 
 * Exports decorator classes for adding functionality to strategies.
 */

export { 
  CachingDecorator, 
  ICacheProvider, 
  InMemoryCacheProvider 
} from './CachingDecorator';

export { 
  LoggingDecorator, 
  ILogger, 
  ConsoleLogger, 
  NoOpLogger 
} from './LoggingDecorator';

export { 
  MetricsDecorator, 
  IMetricsCollector, 
  InMemoryMetricsCollector 
} from './MetricsDecorator';

export { 
  RetryDecorator, 
  RetryPolicy 
} from './RetryDecorator';

export { 
  CompressionDecorator, 
  ICompressionProvider, 
  Base64CompressionProvider 
} from './CompressionDecorator';
