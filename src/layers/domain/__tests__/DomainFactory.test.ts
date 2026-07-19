/**
 * Domain Factory Unit Tests
 */

import { DomainFactory } from '../services/DomainFactory';

describe('DomainFactory', () => {
  let factory: DomainFactory;

  beforeEach(() => {
    factory = new DomainFactory();
  });

  it('should create hello world message with defaults', () => {
    const message = factory.createHelloWorldMessage('Hello World');
    expect(message.content.value).toBe('Hello World');
    expect(message.language).toBe('en');
    expect(message.format).toBe('json');
  });

  it('should create hello world message with options', () => {
    const message = factory.createHelloWorldMessage('Test', { language: 'es', format: 'xml' });
    expect(message.language).toBe('es');
    expect(message.format).toBe('xml');
  });

  it('should create message content', () => {
    const content = factory.createMessageContent('Test content');
    expect(content.value).toBe('Test content');
  });

  it('should create request ID with value', () => {
    const requestId = factory.createRequestId('req-123');
    expect(requestId.value).toBe('req-123');
  });

  it('should create generated request ID', () => {
    const requestId = factory.createRequestId();
    expect(requestId.value.length).toBeGreaterThan(0);
  });

  it('should create correlation ID with value', () => {
    const correlationId = factory.createCorrelationId('corr-456');
    expect(correlationId.value).toBe('corr-456');
  });

  it('should create timestamp', () => {
    const ts = factory.createTimestamp();
    expect(ts.value).toBeInstanceOf(Date);
  });

  it('should create hello world requested event', () => {
    const event = factory.createHelloWorldRequestedEvent('req-1', 'corr-1', 'en', 'json');
    expect(event.eventType).toBe('HelloWorldRequested');
    expect(event.aggregateId).toBe('req-1');
  });

  it('should create audit entry', () => {
    const entry = factory.createAuditEntry('create', 'test');
    expect(entry.action).toBe('create');
    expect(entry.value).toBe('test');
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it('should list supported languages', () => {
    const languages = factory.getSupportedLanguages();
    expect(languages.length).toBeGreaterThan(0);
    expect(languages).toContain('en');
  });

  it('should check language support', () => {
    expect(factory.supportsLanguage('en')).toBe(true);
    expect(factory.supportsLanguage('xx')).toBe(false);
  });
});
