/**
 * Domain Strategies Unit Tests
 */

import { DefaultDomainStrategy } from '../strategies/DefaultDomainStrategy';
import { EventSourcingDomainStrategy } from '../strategies/EventSourcingDomainStrategy';
import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { MessageContent } from '../value-objects/MessageContent';

describe('DefaultDomainStrategy', () => {
  let strategy: DefaultDomainStrategy;

  beforeEach(() => {
    strategy = new DefaultDomainStrategy();
  });

  it('should return name DEFAULT', () => {
    expect(strategy.getName()).toBe('DEFAULT');
  });

  it('should process valid message', async () => {
    const message = HelloWorldMessage.create('Hello World');
    const result = await strategy.process(message);

    expect(result.success).toBe(true);
    expect(result.value).toBe(message);
  });

  it('should reject empty message', async () => {
    expect(() => new HelloWorldMessage('hw-1', MessageContent.create(''))).toThrow('Message content cannot be empty');
  });
});

describe('EventSourcingDomainStrategy', () => {
  let strategy: EventSourcingDomainStrategy;

  beforeEach(() => {
    strategy = new EventSourcingDomainStrategy();
  });

  it('should return name EVENT_SOURCING', () => {
    expect(strategy.getName()).toBe('EVENT_SOURCING');
  });

  it('should record events on process', async () => {
    const message = HelloWorldMessage.create('Hello World');
    await strategy.process(message);

    const events = strategy.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('HelloWorldRequested');
  });

  it('should increment version on each process', async () => {
    const msg1 = HelloWorldMessage.create('Hello');
    const msg2 = HelloWorldMessage.create('World');

    await strategy.process(msg1);
    await strategy.process(msg2);

    expect(strategy.getVersion()).toBe(2);
  });

  it('should store snapshots', async () => {
    const message = HelloWorldMessage.create('Hello World');
    await strategy.process(message);

    const snapshot = strategy.getSnapshot(message.id);
    expect(snapshot).toBeDefined();
    expect(snapshot!.id).toBe(message.id);
  });

  it('should filter events by aggregate ID', async () => {
    const msg1 = HelloWorldMessage.create('Hello');
    const msg2 = HelloWorldMessage.create('World');

    await strategy.process(msg1);
    await strategy.process(msg2);

    const events = strategy.getEventsForAggregate(msg1.id);
    expect(events.length).toBe(1);
    expect(events[0].aggregateId).toBe(msg1.id);
  });

  it('should reject empty message', async () => {
    expect(() => new HelloWorldMessage('hw-1', MessageContent.create(''))).toThrow('Message content cannot be empty');
  });

  it('should clear history', async () => {
    const message = HelloWorldMessage.create('Hello');
    await strategy.process(message);

    strategy.clearHistory();
    expect(strategy.getEvents().length).toBe(0);
    expect(strategy.getVersion()).toBe(0);
  });
});
