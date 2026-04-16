# Subscription Management

## Overview
The Event Layer provides comprehensive subscription management with persistent handlers, subscribe once (auto-unsubscribe), unsubscribe by ID, and clear all subscriptions.

## Subscription Structure

### Subscription Definition
```typescript
interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  once: boolean;
  createdAt: Date;
  metadata: Map<string, any>;
}
```

### Subscription Manager
```typescript
class SubscriptionManager {
  private subscriptions: Map<string, Subscription[]> = new Map();
  
  subscribe(eventType: string, handler: EventHandler, once: boolean = false): string {
    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler,
      once,
      createdAt: new Date(),
      metadata: new Map()
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
  
  unsubscribe(subscriptionId: string): boolean {
    for (const [eventType, subscriptions] of this.subscriptions) {
      const index = subscriptions.findIndex(s => s.id === subscriptionId);
      
      if (index !== -1) {
        subscriptions.splice(index, 1);
        
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        }
        
        return true;
      }
    }
    
    return false;
  }
  
  unsubscribeByEventType(eventType: string): number {
    const subscriptions = this.subscriptions.get(eventType);
    
    if (subscriptions) {
      const count = subscriptions.length;
      this.subscriptions.delete(eventType);
      return count;
    }
    
    return 0;
  }
  
  unsubscribeAll(): number {
    let total = 0;
    
    for (const subscriptions of this.subscriptions.values()) {
      total += subscriptions.length;
    }
    
    this.subscriptions.clear();
    
    return total;
  }
  
  getSubscription(subscriptionId: string): Subscription | undefined {
    for (const subscriptions of this.subscriptions.values()) {
      const subscription = subscriptions.find(s => s.id === subscriptionId);
      if (subscription) {
        return subscription;
      }
    }
    
    return undefined;
  }
  
  getSubscriptionsByEventType(eventType: string): Subscription[] {
    return this.subscriptions.get(eventType) || [];
  }
  
  getAllSubscriptions(): Subscription[] {
    const all: Subscription[] = [];
    
    for (const subscriptions of this.subscriptions.values()) {
      all.push(...subscriptions);
    }
    
    return all;
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
  
  private generateSubscriptionId(): string {
    return crypto.randomUUID();
  }
}
```

## Subscription Filtering

### Subscription Filter
```typescript
class SubscriptionFilter {
  filterByMetadata(subscriptions: Subscription[], key: string, value: any): Subscription[] {
    return subscriptions.filter(s => s.metadata.get(key) === value);
  }
  
  filterByCreationTime(subscriptions: Subscription[], after: Date): Subscription[] {
    return subscriptions.filter(s => s.createdAt > after);
  }
  
  filterByType(subscriptions: Subscription[], eventType: string): Subscription[] {
    return subscriptions.filter(s => s.eventType === eventType);
  }
  
  filterOnce(subscriptions: Subscription[]): Subscription[] {
    return subscriptions.filter(s => s.once);
  }
  
  filterPersistent(subscriptions: Subscription[]): Subscription[] {
    return subscriptions.filter(s => !s.once);
  }
}
```

## Subscription Metadata

### Metadata Manager
```typescript
class SubscriptionMetadataManager {
  setMetadata(subscription: Subscription, key: string, value: any): void {
    subscription.metadata.set(key, value);
  }
  
  getMetadata(subscription: Subscription, key: string): any {
    return subscription.metadata.get(key);
  }
  
  removeMetadata(subscription: Subscription, key: string): void {
    subscription.metadata.delete(key);
  }
  
  clearMetadata(subscription: Subscription): void {
    subscription.metadata.clear();
  }
}
```

## Subscription Persistence

### Persistent Subscriptions
```typescript
class PersistentSubscriptionManager {
  private storage: SubscriptionStorage;
  
  constructor(storage: SubscriptionStorage) {
    this.storage = storage;
  }
  
  async save(subscription: Subscription): Promise<void> {
    await this.storage.save(subscription);
  }
  
  async load(eventType: string): Promise<Subscription[]> {
    return await this.storage.loadByEventType(eventType);
  }
  
  async loadAll(): Promise<Subscription[]> {
    return await this.storage.loadAll();
  }
  
  async delete(subscriptionId: string): Promise<void> {
    await this.storage.delete(subscriptionId);
  }
}

interface SubscriptionStorage {
  save(subscription: Subscription): Promise<void>;
  loadByEventType(eventType: string): Promise<Subscription[]>;
  loadAll(): Promise<Subscription[]>;
  delete(subscriptionId: string): Promise<void>;
}
```

## Best Practices

### Subscription Design Guidelines
- Use descriptive subscription IDs
- Document subscription requirements
- Clean up subscriptions when done
- Use subscribeOnce for one-time handlers
- Add metadata for context

### Subscription Cleanup Guidelines
- Unsubscribe when handler no longer needed
- Use unsubscribeByEventType for bulk cleanup
- Monitor subscription counts
- Implement automatic cleanup for once subscriptions
- Document cleanup requirements

### Performance Considerations
- Use efficient data structures for storage
- Implement lazy loading for persistent subscriptions
- Cache subscription lookups
- Monitor subscription memory usage
