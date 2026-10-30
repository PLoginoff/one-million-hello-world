/**
 * Proxy Engine — public surface.
 *
 * @module ProxyLayer/Engine
 */

export {
  type AccessDecision,
  type AccessPolicy,
  type Clock,
  type Invocation,
  type InvocationContext,
  type InvocationResult,
  type Interceptor,
  type InterceptorDecision,
  type MethodStats,
  type Principal,
  type ProxiableTarget,
  type ProxyEngineStats,
  type Serializer,
  type TargetMethod,
  type Transport,
  type WireRequest,
  type WireResponse,
  ProxyAccessDeniedError,
  RemoteInvocationError,
  systemClock,
} from './types';

export { InterceptorChain, CONTINUE, shortCircuit, type ChainResult } from './InterceptorChain';
export { ProxyStatistics, type CallRecord } from './ProxyStatistics';
export { VirtualProxy, type TargetFactory, type VirtualProxyOptions } from './VirtualProxy';
export { ProtectionProxy } from './ProtectionProxy';
export {
  CachingProxy,
  defaultKeyFn,
  stableStringify,
  type CachedInvocationResult,
  type CachingProxyOptions,
} from './CachingProxy';
export {
  RemoteProxyStub,
  LocalTransport,
  JsonSerializer,
  IdentitySerializer,
  type LocalTransportOptions,
  type RemoteStubOptions,
} from './RemoteProxyStub';
export {
  SmartReference,
  Handle,
  ReleasedHandleError,
  type SmartReferenceOptions,
} from './SmartReference';
export {
  ProxyEngine,
  type EngineInvocationResult,
  type InvocationSink,
  type ProxyEngineOptions,
} from './ProxyEngine';
