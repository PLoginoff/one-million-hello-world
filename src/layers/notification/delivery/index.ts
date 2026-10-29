/**
 * Notification delivery engine — public API.
 *
 * @module NotificationLayer/Delivery
 */

export * from './NotificationTypes';
export { TemplateEngine, escapeHtml } from './TemplateEngine';
export type { Template } from './TemplateEngine';
export {
  StubAdapter,
  EmailAdapter,
  SmsAdapter,
  PushAdapter,
  WebhookAdapter,
} from './ChannelAdapters';
export type { ScriptedFailure } from './ChannelAdapters';
export { PreferenceStore, inQuietHours, quietEnd } from './PreferenceStore';
export type { Resolution } from './PreferenceStore';
export { DedupStore, dedupHash, fnv1a } from './DedupStore';
export { DigestBatcher } from './DigestBatcher';
export { DeliveryTracker } from './DeliveryTracker';
export type { ProviderCallback } from './DeliveryTracker';
export { DeliveryEngine } from './DeliveryEngine';
export type { TargetResolver } from './DeliveryEngine';
