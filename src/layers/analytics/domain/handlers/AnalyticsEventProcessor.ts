/**
 * Analytics Event Processor
 *
 * Real business logic for processing analytics events.
 * Handles event validation, enrichment, routing, and aggregation.
 */

import { IAnalyticsAdapter } from '../../adapters/InMemoryAdapter';
import {
  AnalyticsEventType,
  AnalyticsDomainEvent,
  AnalyticsEventPayload,
  PageViewPayload,
  EventTrackedPayload,
  UserIdentifiedPayload,
  SessionStartedPayload,
  SessionEndedPayload,
  FunnelStepPayload,
  ConversionPayload,
  DeviceInfo,
  AttributionData,
} from '../events/AnalyticsEventTypes';

export interface AnalyticsProcessorConfig {
  enableValidation: boolean;
  enableEnrichment: boolean;
  enableSessionTracking: boolean;
  enableFunnelTracking: boolean;
  enableConversionTracking: boolean;
  sessionTimeoutMs: number;
  maxEventSize: number;
  allowedEventTypes: AnalyticsEventType[];
  piiFields: string[];
}

export interface EnrichedEvent extends AnalyticsDomainEvent {
  enriched: boolean;
  sessionId?: string;
  userId?: string;
  deviceInfo?: DeviceInfo;
  geoInfo?: GeoInfo;
  attribution?: AttributionData;
  processingTimeMs: number;
}

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  ip?: string;
}

export interface SessionData {
  sessionId: string;
  userId?: string;
  startedAt: number;
  lastActivityAt: number;
  pageViews: number;
  eventsTracked: number;
  referrer?: string;
  utmParams?: Record<string, string>;
  deviceInfo?: DeviceInfo;
  anonymousId?: string;
  [key: string]: unknown;
}

export interface FunnelState {
  funnelName: string;
  userId?: string;
  sessionId?: string;
  currentStep: number;
  completedSteps: string[];
  startedAt: number;
  lastStepAt: number;
}

export class AnalyticsEventProcessor {
  private _config: AnalyticsProcessorConfig;
  private _adapters: Map<string, IAnalyticsAdapter>;
  private _sessions: Map<string, SessionData>;
  private _funnels: Map<string, FunnelState>;
  private _eventCounts: Map<string, number>;
  private _errorCounts: Map<string, number>;
  private _processingTimes: number[];
  private _startTime: number;

  constructor(config: Partial<AnalyticsProcessorConfig> = {}) {
    this._config = {
      enableValidation: true,
      enableEnrichment: true,
      enableSessionTracking: true,
      enableFunnelTracking: true,
      enableConversionTracking: true,
      sessionTimeoutMs: 30 * 60 * 1000,
      maxEventSize: 1024 * 1024,
      allowedEventTypes: Object.values(AnalyticsEventType),
      piiFields: ['email', 'phone', 'address', 'ssn', 'creditCard'],
      ...config,
    };

    this._adapters = new Map();
    this._sessions = new Map();
    this._funnels = new Map();
    this._eventCounts = new Map();
    this._errorCounts = new Map();
    this._processingTimes = [];
    this._startTime = Date.now();

    this._startCleanupInterval();
  }

  registerAdapter(name: string, adapter: IAnalyticsAdapter): void {
    this._adapters.set(name, adapter);
  }

  unregisterAdapter(name: string): void {
    this._adapters.delete(name);
  }

  async processEvent(event: AnalyticsDomainEvent): Promise<EnrichedEvent> {
    const startTime = Date.now();

    try {
      const validatedEvent = this._validateEvent(event);
      const enrichedEvent = this._enrichEvent(validatedEvent);
      await this._routeEvent(enrichedEvent);
      this._updateAggregations(enrichedEvent);

      const processingTime = Date.now() - startTime;
      this._recordProcessingTime(processingTime);
      this._incrementEventCount(enrichedEvent.type);

      return { ...enrichedEvent, processingTimeMs: processingTime };
    } catch (error) {
      this._incrementErrorCount(event.type);
      throw error;
    }
  }

  async processBatch(events: AnalyticsDomainEvent[]): Promise<EnrichedEvent[]> {
    const results: EnrichedEvent[] = [];
    for (const event of events) {
      try {
        const result = await this.processEvent(event);
        results.push(result);
      } catch (error) {
        this._incrementErrorCount(event.type);
        results.push({
          ...event,
          enriched: false,
          processingTimeMs: 0,
        } as EnrichedEvent);
      }
    }
    return results;
  }

  getSession(sessionId: string): SessionData | undefined {
    return this._sessions.get(sessionId);
  }

  getFunnelState(funnelKey: string): FunnelState | undefined {
    return this._funnels.get(funnelKey);
  }

  getEventCounts(): Record<string, number> {
    return Object.fromEntries(this._eventCounts);
  }

  getErrorCounts(): Record<string, number> {
    return Object.fromEntries(this._errorCounts);
  }

  getAverageProcessingTime(): number {
    if (this._processingTimes.length === 0) return 0;
    const sum = this._processingTimes.reduce((a, b) => a + b, 0);
    return sum / this._processingTimes.length;
  }

  getUptime(): number {
    return Date.now() - this._startTime;
  }

  getAdapterStatus(): Record<string, Record<string, unknown>> {
    const status: Record<string, Record<string, unknown>> = {};
    for (const [name, adapter] of this._adapters) {
      status[name] = adapter.getStatus();
    }
    return status;
  }

  private _validateEvent(event: AnalyticsDomainEvent): AnalyticsDomainEvent {
    if (!this._config.enableValidation) return event;

    if (!this._config.allowedEventTypes.includes(event.type)) {
      throw new Error(`Event type not allowed: ${event.type}`);
    }

    if (event.payload === null || event.payload === undefined || typeof event.payload !== 'object') {
      throw new Error('Event payload is required and must be an object');
    }

    const eventSize = JSON.stringify(event).length;
    if (eventSize > this._config.maxEventSize) {
      throw new Error(`Event size exceeds maximum: ${eventSize} > ${this._config.maxEventSize}`);
    }

    this._sanitizePii(event.payload);

    return event;
  }

  private _sanitizePii(payload: AnalyticsEventPayload): void {
    const sanitize = (obj: unknown, path: string = ''): void => {
      if (obj === null || obj === undefined || typeof obj !== 'object') return;
      const record = obj as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (this._config.piiFields.some((pii) => fullPath.toLowerCase().includes(pii.toLowerCase()))) {
          record[key] = '[REDACTED]';
        } else {
          const value = record[key];
          if (value !== null && value !== undefined && typeof value === 'object') {
            sanitize(value, fullPath);
          }
        }
      }
    };
    sanitize(payload);
  }

  private _enrichEvent(event: AnalyticsDomainEvent): EnrichedEvent {
    if (!this._config.enableEnrichment) {
      return { ...event, enriched: false, processingTimeMs: 0 };
    }

    const enriched: EnrichedEvent = {
      ...event,
      enriched: true,
      processingTimeMs: 0,
    };

    const payload = event.payload;

    switch (event.type) {
      case AnalyticsEventType.PAGE_VIEW: {
        const pv = payload as PageViewPayload;
        enriched.sessionId = this._extractSessionId(pv);
        enriched.userId = this._extractUserId(pv);
        enriched.deviceInfo = this._parseDeviceInfo(pv.userAgent);
        enriched.geoInfo = this._extractGeoInfo(pv);
        enriched.attribution = this._extractAttribution(pv);
        break;
      }
      case AnalyticsEventType.EVENT_TRACKED: {
        const et = payload as EventTrackedPayload;
        enriched.sessionId = et.sessionId;
        enriched.userId = et.userId;
        break;
      }
      case AnalyticsEventType.USER_IDENTIFIED: {
        const ui = payload as UserIdentifiedPayload;
        enriched.userId = ui.userId;
        this._updateSessionUserId(ui.anonymousId, ui.userId);
        break;
      }
      case AnalyticsEventType.SESSION_STARTED: {
        const ss = payload as SessionStartedPayload;
        enriched.sessionId = ss.sessionId;
        enriched.userId = ss.userId;
        enriched.deviceInfo = ss.deviceInfo;
        enriched.attribution = ss.utmParams
          ? {
              source: ss.utmParams.utm_source,
              medium: ss.utmParams.utm_medium,
              campaign: ss.utmParams.utm_campaign,
              content: ss.utmParams.utm_content,
              term: ss.utmParams.utm_term,
            }
          : undefined;
        this._createSession(ss);
        break;
      }
      case AnalyticsEventType.SESSION_ENDED: {
        const se = payload as SessionEndedPayload;
        enriched.sessionId = se.sessionId;
        this._endSession(se.sessionId);
        break;
      }
      case AnalyticsEventType.FUNNEL_STEP: {
        const fs = payload as FunnelStepPayload;
        enriched.sessionId = fs.sessionId;
        enriched.userId = fs.userId;
        this._updateFunnel(fs);
        break;
      }
      case AnalyticsEventType.CONVERSION: {
        const cv = payload as ConversionPayload;
        enriched.sessionId = cv.sessionId;
        enriched.userId = cv.userId;
        enriched.attribution = cv.attribution;
        break;
      }
    }

    return enriched;
  }

  private async _routeEvent(event: EnrichedEvent): Promise<void> {
    for (const [name, adapter] of this._adapters) {
      try {
        await adapter.execute(event);
      } catch (error) {
        console.error(`Adapter ${name} failed:`, error);
      }
    }
  }

  private _updateAggregations(event: EnrichedEvent): void {
    if (event.type === AnalyticsEventType.PAGE_VIEW && event.sessionId !== undefined && event.sessionId !== '') {
      const session = this._sessions.get(event.sessionId);
      if (session) {
        session.pageViews++;
        session.lastActivityAt = Date.now();
      }
    }

    if (event.type === AnalyticsEventType.EVENT_TRACKED && event.sessionId !== undefined && event.sessionId !== '') {
      const session = this._sessions.get(event.sessionId);
      if (session) {
        session.eventsTracked++;
        session.lastActivityAt = Date.now();
      }
    }
  }

  private _extractSessionId(payload: PageViewPayload): string | undefined {
    const value = (payload as Record<string, unknown>)['sessionId'];
    return value !== undefined && value !== '' ? String(value) : undefined;
  }

  private _extractUserId(payload: PageViewPayload): string | undefined {
    const value = (payload as Record<string, unknown>)['userId'];
    return value !== undefined && value !== '' ? String(value) : undefined;
  }

  private _parseDeviceInfo(userAgent?: string): DeviceInfo | undefined {
    if (userAgent === undefined || userAgent === '') return undefined;

    const ua = userAgent.toLowerCase();
    let type: DeviceInfo['type'] = 'desktop';
    if (/mobile|android|iphone|ipad/.test(ua)) {
      type = /ipad/.test(ua) ? 'tablet' : 'mobile';
    }

    let os = 'unknown';
    if (/windows/.test(ua)) os = 'Windows';
    else if (/mac os/.test(ua)) os = 'macOS';
    else if (/linux/.test(ua)) os = 'Linux';
    else if (/android/.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/.test(ua)) os = 'iOS';

    let browser = 'unknown';
    let browserVersion = 'unknown';
    if (/edg\//.test(ua)) {
      browser = 'Edge';
      browserVersion = ua.match(/edg\/([\d.]+)/)?.[1] ?? 'unknown';
    } else if (/chrome\//.test(ua) && !/edg\//.test(ua)) {
      browser = 'Chrome';
      browserVersion = ua.match(/chrome\/([\d.]+)/)?.[1] ?? 'unknown';
    } else if (/firefox\//.test(ua)) {
      browser = 'Firefox';
      browserVersion = ua.match(/firefox\/([\d.]+)/)?.[1] ?? 'unknown';
    } else if (/safari\//.test(ua) && !/chrome\//.test(ua)) {
      browser = 'Safari';
      browserVersion = ua.match(/version\/([\d.]+)/)?.[1] ?? 'unknown';
    }

    return { type, os, browser, browserVersion };
  }

  private _extractGeoInfo(payload: PageViewPayload): GeoInfo | undefined {
    const value = (payload as Record<string, unknown>)['geo'];
    return value !== undefined && value !== null && typeof value === 'object' ? (value as GeoInfo) : undefined;
  }

  private _extractAttribution(payload: PageViewPayload): AttributionData | undefined {
    const utm = (payload as Record<string, unknown>)['utmParams'] as Record<string, string> | undefined;
    if (utm === undefined || utm === null) return undefined;
    return {
      source: utm.utm_source,
      medium: utm.utm_medium,
      campaign: utm.utm_campaign,
      content: utm.utm_content,
      term: utm.utm_term,
    };
  }

  private _createSession(payload: SessionStartedPayload): void {
    const session: SessionData = {
      sessionId: payload.sessionId,
      userId: payload.userId,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      pageViews: 0,
      eventsTracked: 0,
      referrer: payload.referrer,
      utmParams: payload.utmParams,
      deviceInfo: payload.deviceInfo,
    };
    this._sessions.set(payload.sessionId, session);
  }

  private _endSession(sessionId: string): void {
    this._sessions.delete(sessionId);
  }

  private _updateSessionUserId(anonymousId: string | undefined, userId: string): void {
    if (anonymousId === undefined || anonymousId === '') return;
    for (const session of this._sessions.values()) {
      if (session.anonymousId !== undefined && session.anonymousId === anonymousId) {
        session.userId = userId;
      }
    }
  }

  private _updateFunnel(payload: FunnelStepPayload): void {
    if (!this._config.enableFunnelTracking) return;

    const key = `${payload.funnelName}:${payload.userId ?? payload.sessionId ?? 'anonymous'}`;
    let funnel = this._funnels.get(key);

    if (!funnel) {
      funnel = {
        funnelName: payload.funnelName,
        userId: payload.userId,
        sessionId: payload.sessionId,
        currentStep: 0,
        completedSteps: [],
        startedAt: Date.now(),
        lastStepAt: Date.now(),
      };
      this._funnels.set(key, funnel);
    }

    if (payload.stepIndex === funnel.currentStep) {
      funnel.completedSteps.push(payload.stepName);
      funnel.currentStep = payload.stepIndex + 1;
      funnel.lastStepAt = Date.now();
    }
  }

  private _incrementEventCount(type: AnalyticsEventType): void {
    const current = this._eventCounts.get(type) ?? 0;
    this._eventCounts.set(type, current + 1);
  }

  private _incrementErrorCount(type: AnalyticsEventType): void {
    const current = this._errorCounts.get(type) ?? 0;
    this._errorCounts.set(type, current + 1);
  }

  private _recordProcessingTime(time: number): void {
    this._processingTimes.push(time);
    if (this._processingTimes.length > 1000) {
      this._processingTimes.shift();
    }
  }

  private _startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this._sessions) {
        if (now - session.lastActivityAt > this._config.sessionTimeoutMs) {
          this._sessions.delete(sessionId);
        }
      }
      for (const [key, funnel] of this._funnels) {
        if (now - funnel.lastStepAt > this._config.sessionTimeoutMs) {
          this._funnels.delete(key);
        }
      }
    }, 60000);
  }
}
