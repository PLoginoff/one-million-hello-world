/**
 * Analytics Event Types
 *
 * Defines all event types specific to the Analytics layer.
 * Each event type has a specific payload structure for type safety.
 */

export enum AnalyticsEventType {
  PAGE_VIEW = 'analytics.page_view',
  EVENT_TRACKED = 'analytics.event_tracked',
  USER_IDENTIFIED = 'analytics.user_identified',
  SESSION_STARTED = 'analytics.session_started',
  SESSION_ENDED = 'analytics.session_ended',
  FUNNEL_STEP = 'analytics.funnel_step',
  CONVERSION = 'analytics.conversion',
  ERROR_TRACKED = 'analytics.error_tracked',
  PERFORMANCE_METRIC = 'analytics.performance_metric',
  CUSTOM_EVENT = 'analytics.custom_event',
}

export interface PageViewPayload {
  url: string;
  referrer?: string;
  title?: string;
  screenResolution?: string;
  viewportSize?: string;
  userAgent?: string;
  loadTimeMs?: number;
  domContentLoadedMs?: number;
  sessionId?: string;
  userId?: string;
  geo?: GeoInfo;
  utmParams?: Record<string, string>;
  [key: string]: unknown;
}

export interface EventTrackedPayload {
  eventName: string;
  properties: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface UserIdentifiedPayload {
  userId: string;
  traits: Record<string, unknown>;
  anonymousId?: string;
  [key: string]: unknown;
}

export interface SessionStartedPayload {
  sessionId: string;
  userId?: string;
  referrer?: string;
  utmParams?: Record<string, string>;
  deviceInfo?: DeviceInfo;
  [key: string]: unknown;
}

export interface SessionEndedPayload {
  sessionId: string;
  durationMs: number;
  pageViews: number;
  eventsTracked: number;
  [key: string]: unknown;
}

export interface FunnelStepPayload {
  funnelName: string;
  stepName: string;
  stepIndex: number;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConversionPayload {
  conversionName: string;
  value?: number;
  currency?: string;
  userId?: string;
  sessionId?: string;
  attribution?: AttributionData;
  [key: string]: unknown;
}

export interface ErrorTrackedPayload {
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  url?: string;
  [key: string]: unknown;
}

export interface PerformanceMetricPayload {
  metricName: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percentage';
  tags?: Record<string, string>;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface CustomEventPayload {
  eventName: string;
  payload: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet';
  os: string;
  browser: string;
  browserVersion: string;
  screenResolution?: string;
  [key: string]: unknown;
}

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  ip?: string;
  [key: string]: unknown;
}

export interface AttributionData {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  [key: string]: unknown;
}

export type AnalyticsEventPayload =
  | PageViewPayload
  | EventTrackedPayload
  | UserIdentifiedPayload
  | SessionStartedPayload
  | SessionEndedPayload
  | FunnelStepPayload
  | ConversionPayload
  | ErrorTrackedPayload
  | PerformanceMetricPayload
  | CustomEventPayload;

export interface AnalyticsDomainEvent<T extends AnalyticsEventType = AnalyticsEventType> {
  type: T;
  payload: AnalyticsEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}
