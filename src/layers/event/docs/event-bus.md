# Event Bus

## Overview
The Event Layer implements a publish/subscribe event bus pattern for event-driven communication with multiple handler support and subscription management.

## Event Bus Structure

### Event Definition
```typescript
interface Event {
  type: string;
  data: any;
  timestamp: Date;
  id: string;
}

interface EventHandler {
  (event: Event): Promise<void> | void;
}

interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  once: boolean;
}
```

### Event Bus Implementation
```typescript
class EventBus implements IEventBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private config: EventBusConfig;
  
  constructor(config: EventBusConfig) {
    this.config = config;
  }
  
  subscribe(eventType: string, handler: EventHandler, once: boolean = false): string {
    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler,
      once
    };
    
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    
    this.subscriptions.get(eventType)?.push(subscription);
    
    return subscription.id;
  }
  
  subscribeOnce(eventType: string, handler: EventHandler): string {
    return this.subscribe(eventType, handler, true);
  }
  
  unsubscribe(subscriptionId: string): void {
    for (const [eventType, subscriptions] of this.subscriptions) {
      const index = subscriptions.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        }
        
        break;
      }
    }
  }
  
  async publish(event: Event): Promise<void> {
    const subscriptions = this.subscriptions.get(event.type) || [];
    
    if (this.config.async) {
      await this.publishAsync(event, subscriptions);
    } else {
      this.publishSync(event, subscriptions);
    }
  }
  
  private async publishAsync(event: Event, subscriptions: Subscription[]): Promise<void> {
    const promises = subscriptions.map(subscription => this.executeHandler(subscription, event));
    
    if (this.config.queueSizeLimit > 0) {
      await this.executeWithQueueLimit(promises);
    } else {
      await Promise.all(promises);
    }
  }
  
  private publishSync(event: Event, subscriptions: Subscription[]): void {
    for (const subscription of subscriptions) {
      try {
        subscription.handler(event);
      } catch (error) {
        this.handleError(error, subscription);
      }
    }
  }
  
  private async executeHandler(subscription: Subscription, event: Event): Promise<void> {
    try {
      await subscription.handler(event);
      
      if (subscription.once) {
        this.unsubscribe(subscription.id);
      }
    } catch (error) {
      this.handleError(error, subscription);
    }
  }
  
  private async executeWithQueueLimit(promises: Promise<void>[]): Promise<void> {
    const queue = promises.slice(0, this.config.queueSizeLimit);
    await Promise.all(queue);
  }
  
  private handleError(error: Error, subscription: Subscription): void {
    this.errorHandler.handle(error, subscription);
  }
  
  private generateSubscriptionId(): string {
    return crypto.randomUUID();
  }
  
  clear(): void {
    this.subscriptions.clear();
  }
  
  getSubscriptionCount(eventType?: string): number {
    if (eventType) {
      return (this.subscriptions.get(eventType) || []).length;
    }
    
    let total = 0;
    for (const subscriptions of this.subscriptions.values()) {
      total += subscriptions.length;
    }
    
    return total;
  }
}
```

## Event Bus Configuration

### Configuration Options
```typescript
interface EventBusConfig {
  async: boolean;
  persistence: boolean;
  queueSizeLimit: number;
  errorHandler: ErrorHandler;
}

class EventBusConfigManager {
  private config: EventBusConfig;
  
  constructor(defaultConfig: EventBusConfig) {
    this.config = defaultConfig;
  }
  
  enableAsync(): void {
    this.config.async = true;
  }
  
  disableAsync(): void {
    this.config.async = false;
  }
  
  setQueueSizeLimit(limit: number): void {
    this.config.queueSizeLimit = limit;
  }
  
  enablePersistence(): void {
    this.config.persistence = true;
  }
  
  disablePersistence(): void {
    this.config.persistence = false;
  }
  
  getConfig(): EventBusConfig {
    return { ...this.config };
  }
}
```

## Event Publishing

### Event Publisher
```typescript
class EventPublisher {
  private eventBus: EventBus;
  
  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }
  
  async publish(type: string, data: any): Promise<void> {
    const event: Event = {
      type,
      data,
      timestamp: new Date(),
      id: crypto.randomUUID()
    };
    
    await this.eventBus.publish(event);
  }
  
  publishSync(type: string, data: any): void {
    const event: Event = {
      type,
      data,
      timestamp: new Date(),
      id: crypto.randomUUID()
    };
    
    this.eventBus.publish(event);
  }
}
```

## Best Practices

### Event Bus Design Guidelines
- Use descriptive event types
- Keep event handlers focused
- Handle errors gracefully
- Use async handlers for I/O operations
- Document event schemas

### Subscription Management Guidelines
- Clean up subscriptions when done
- Use subscribeOnce for one-time handlers
- Document subscription requirements
- Monitor subscription counts
- Use unique subscription IDs

### Performance Considerations
- Use async for I/O-bound handlers
- Implement queue size limits
- Monitor handler execution time
- Use connection pooling for external services
