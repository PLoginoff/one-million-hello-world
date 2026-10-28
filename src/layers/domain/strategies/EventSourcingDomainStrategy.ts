/**
 * Event Sourcing Domain Strategy
 *
 * Domain strategy that records domain events for each processed message,
 * enabling event replay and audit trail reconstruction.
 */

import { IDomainStrategy } from './IDomainStrategy';
import { ILegacyDomainStrategy } from './ILegacyDomainStrategy';
import { HelloWorldMessage } from '../entities/HelloWorldMessage';
import { DomainContext, DomainResult, DomainEvent } from '../types/domain-types';
import { HelloWorldRequested } from '../events/HelloWorldRequested';

export interface EventSourcingState {
  events: DomainEvent[];
  snapshots: Map<string, HelloWorldMessage>;
}

export class EventSourcingDomainStrategy implements IDomainStrategy<HelloWorldMessage, HelloWorldMessage>, ILegacyDomainStrategy {
  private readonly _state: EventSourcingState;
  private _version: number;

  constructor() {
    this._state = { events: [], snapshots: new Map() };
    this._version = 0;
  }

  getName(): string {
    return 'EVENT_SOURCING';
  }

  getPriority(): number {
    return 10;
  }

  async execute(input: HelloWorldMessage, context: DomainContext): Promise<DomainResult<HelloWorldMessage>> {
    return this.process(input);
  }

  async process(message: HelloWorldMessage): Promise<DomainResult<HelloWorldMessage>> {
    if (message.content.value.length === 0) {
      return Promise.resolve({
        success: false,
        error: { code: 'EMPTY_MESSAGE', message: 'Message content cannot be empty' },
      });
    }

    const event = new HelloWorldRequested(message.id, message.id, message.language, message.format);

    this._state.events.push(event);
    this._state.snapshots.set(message.id, message);
    this._version++;

    return Promise.resolve({ success: true, value: message });
  }

  getEvents(): DomainEvent[] {
    return [...this._state.events];
  }

  getEventsForAggregate(aggregateId: string): DomainEvent[] {
    return this._state.events.filter((e) => e.aggregateId === aggregateId);
  }

  getSnapshot(aggregateId: string): HelloWorldMessage | undefined {
    return this._state.snapshots.get(aggregateId);
  }

  getVersion(): number {
    return this._version;
  }

  replayEvents(): DomainEvent[] {
    return this.getEvents();
  }

  clearHistory(): void {
    this._state.events = [];
    this._state.snapshots.clear();
    this._version = 0;
  }
}