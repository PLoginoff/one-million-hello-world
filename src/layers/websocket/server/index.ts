/**
 * Server-side WebSocket infrastructure — routing, rooms, presence,
 * rate limiting, backpressure and resume support.
 */

export { ConnectionRateLimiter, ViolationAction } from './ConnectionRateLimiter';
export type {
  ConnectionRateLimiterOptions,
  RateLimitDecision,
} from './ConnectionRateLimiter';
export { SendQueue, BackpressurePolicy, DropReason } from './SendQueue';
export type {
  SendQueueOptions,
  SendQueueStats,
  SendSink,
  QueuedSend,
} from './SendQueue';
export {
  ResumeBuffer,
  ResumeTokenIssuer,
  HmacResumeTokenSigner,
  TestResumeTokenSigner,
  newConnectionId,
} from './ResumeBuffer';
export type {
  BufferedMessage,
  ResumeResult,
  ResumeBufferOptions,
  ResumeToken,
  ResumeTokenSigner,
} from './ResumeBuffer';
export { RoomManager, JoinRejectedError, JoinRejection } from './RoomManager';
export type {
  ConnectionId,
  RoomBroadcast,
  BroadcastReceipt,
  RoomSendFn,
  RoomManagerOptions,
} from './RoomManager';
export { PresenceRegistry, PresenceState } from './PresenceRegistry';
export type {
  UserId,
  ConnectionPresence,
  UserPresence,
  PresenceEvent,
  PresenceListener,
  PresenceRegistryOptions,
} from './PresenceRegistry';
export {
  UpgradeRouter,
  ServerConnection,
  RoutePattern,
} from './UpgradeRouter';
export type {
  RouteDefinition,
  RouteHooks,
  RouteContext,
  RouteRateLimit,
  RouteResume,
  RouteBackpressure,
  UpgradeDecision,
  UpgradeRouterOptions,
} from './UpgradeRouter';
