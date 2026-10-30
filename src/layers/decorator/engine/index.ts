/**
 * Decoration Engine — public exports.
 *
 * @module DecoratorLayer/Engine
 */

export * from './types';
export { DecoratorChain, orderDecorators } from './DecoratorChain';
export { TransparentProxyFactory } from './TransparentProxyFactory';
export type { ChainTelemetry, WrapOptions } from './TransparentProxyFactory';
export { DecoratorRegistry } from './DecoratorRegistry';
export type { DecoratorRegistryOptions } from './DecoratorRegistry';
export { SelfHealingDecorator } from './SelfHealingDecorator';
export type { InnerFactory, SelfHealingOptions, SwapInfo } from './SelfHealingDecorator';
export {
  loggingDecorator,
  timingDecorator,
  retryDecorator,
  memoizeDecorator,
  conditionalDecorator,
  TimingRecorder,
} from './BuiltInDecorators';
export type {
  LogSink,
  LoggingDecoratorOptions,
  TimingDecoratorOptions,
  RetryDecoratorOptions,
  MemoizeDecoratorOptions,
} from './BuiltInDecorators';
export { DecorationEngine } from './DecorationEngine';
export type { RecordedInvocation } from './DecorationEngine';
