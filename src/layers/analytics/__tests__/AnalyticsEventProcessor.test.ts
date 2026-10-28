/**
 * Analytics Event Processor Tests
 */

import { AnalyticsEventProcessor } from '../domain/handlers/AnalyticsEventProcessor';
import { AnalyticsInMemoryAdapter } from '../adapters/InMemoryAdapter';
import { AnalyticsEventType, PageViewPayload, EventTrackedPayload, SessionStartedPayload } from '../domain/events/AnalyticsEventTypes';

describe('AnalyticsEventProcessor', () => {
  let processor: AnalyticsEventProcessor;
  let adapter: AnalyticsInMemoryAdapter;

  beforeEach(() => {
    processor = new AnalyticsEventProcessor({
      enableValidation: true,
      enableEnrichment: true,
      enableSessionTracking: true,
      sessionTimeoutMs: 60000,
    });
    adapter = new AnalyticsInMemoryAdapter();
    processor.registerAdapter('inmemory', adapter);
  });

  afterEach(async () => {
    await adapter.clearResponses();
  });

  describe('processEvent', () => {
    it('should process a page view event', async () => {
      const event = {
        type: AnalyticsEventType.PAGE_VIEW,
        payload: {
          url: 'https://example.com/page',
          referrer: 'https://google.com',
          title: 'Test Page',
          loadTimeMs: 150,
        } as PageViewPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_123',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AnalyticsEventType.PAGE_VIEW);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should process an event tracked event', async () => {
      const event = {
        type: AnalyticsEventType.EVENT_TRACKED,
        payload: {
          eventName: 'button_click',
          properties: { buttonId: 'submit', page: '/checkout' },
          userId: 'user_123',
          sessionId: 'session_456',
          timestamp: Date.now(),
        } as EventTrackedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_124',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.sessionId).toBe('session_456');
      expect(result.userId).toBe('user_123');
    });

    it('should create session on session started', async () => {
      const event = {
        type: AnalyticsEventType.SESSION_STARTED,
        payload: {
          sessionId: 'session_789',
          userId: 'user_123',
          referrer: 'https://example.com',
          utmParams: { utm_source: 'google', utm_medium: 'cpc' },
          deviceInfo: { type: 'desktop', os: 'Windows', browser: 'Chrome', browserVersion: '120' },
        } as SessionStartedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_125',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.sessionId).toBe('session_789');
      expect(result.attribution?.source).toBe('google');

      const session = processor.getSession('session_789');
      expect(session).toBeDefined();
      expect(session?.userId).toBe('user_123');
    });

    it('should reject disallowed event types', async () => {
      const restrictedProcessor = new AnalyticsEventProcessor({
        allowedEventTypes: [AnalyticsEventType.PAGE_VIEW],
      });

      const event = {
        type: AnalyticsEventType.CONVERSION,
        payload: { conversionName: 'purchase', value: 100 },
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_126',
      };

      await expect(restrictedProcessor.processEvent(event)).rejects.toThrow('Event type not allowed');
    });

    it('should sanitize PII fields', async () => {
      const event = {
        type: AnalyticsEventType.EVENT_TRACKED,
        payload: {
          eventName: 'form_submit',
          properties: { email: 'test@example.com', name: 'John' },
        } as EventTrackedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_127',
      };

      const result = await processor.processEvent(event);
      expect(result.payload.properties).toEqual({ email: '[REDACTED]', name: 'John' });
    });
  });

  describe('processBatch', () => {
    it('should process multiple events', async () => {
      const events = [
        {
          type: AnalyticsEventType.PAGE_VIEW,
          payload: { url: 'https://example.com/1' } as PageViewPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_1',
        },
        {
          type: AnalyticsEventType.PAGE_VIEW,
          payload: { url: 'https://example.com/2' } as PageViewPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_2',
        },
        {
          type: AnalyticsEventType.EVENT_TRACKED,
          payload: { eventName: 'click', properties: {} } as EventTrackedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_3',
        },
      ];

      const results = await processor.processBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.enriched)).toBe(true);
    });
  });

  describe('session tracking', () => {
    it('should track page views in session', async () => {
      await processor.processEvent({
        type: AnalyticsEventType.SESSION_STARTED,
        payload: { sessionId: 'sess_1', userId: 'user_1' } as SessionStartedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AnalyticsEventType.PAGE_VIEW,
        payload: { url: 'https://example.com', sessionId: 'sess_1' } as PageViewPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const session = processor.getSession('sess_1');
      expect(session?.pageViews).toBe(1);
    });
  });

  describe('adapters', () => {
    it('should route events to registered adapters', async () => {
      const event = {
        type: AnalyticsEventType.PAGE_VIEW,
        payload: { url: 'https://example.com' } as PageViewPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      };

      await processor.processEvent(event);

      const status = adapter.getStatus();
      expect(status.executionCount).toBe(1);
    });

    it('should track adapter status', () => {
      const status = processor.getAdapterStatus();
      expect(status.inmemory).toBeDefined();
      expect(status.inmemory.adapter).toBe('inmemory');
    });
  });

  describe('statistics', () => {
    it('should track event counts', async () => {
      await processor.processEvent({
        type: AnalyticsEventType.PAGE_VIEW,
        payload: { url: 'https://example.com' } as PageViewPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AnalyticsEventType.EVENT_TRACKED,
        payload: { eventName: 'click', properties: {} } as EventTrackedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const counts = processor.getEventCounts();
      expect(counts[AnalyticsEventType.PAGE_VIEW]).toBe(1);
      expect(counts[AnalyticsEventType.EVENT_TRACKED]).toBe(1);
    });

    it('should track average processing time', async () => {
      await processor.processEvent({
        type: AnalyticsEventType.PAGE_VIEW,
        payload: { url: 'https://example.com' } as PageViewPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      const avgTime = processor.getAverageProcessingTime();
      expect(avgTime).toBeGreaterThanOrEqual(0);
    });
  });
});