# Queue Management

## Overview
The Message Queue Layer implements queue management with enqueue with priority support, dequeue with handler execution, priority-based message ordering, and maximum queue size limit.

## Message Structure

### Message Definition
```typescript
interface Message {
  id: string;
  data: any;
  priority: MessagePriority;
  attempts: number;
  createdAt: Date;
  queuedAt: Date;
  metadata: Map<string, any>;
}

enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}
```

### Queue Manager
```typescript
class QueueManager {
  private queue: PriorityQueue<Message>;
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.queue = new PriorityQueue((a, b) => b.priority - a.priority);
    this.maxSize = maxSize;
  }
  
  enqueue(message: Message): boolean {
    if (this.queue.size() >= this.maxSize) {
      return false;
    }
    
    message.queuedAt = new Date();
    this.queue.enqueue(message);
    
    return true;
  }
  
  dequeue(): Message | null {
    return this.queue.dequeue();
  }
  
  peek(): Message | null {
    return this.queue.peek();
  }
  
  size(): number {
    return this.queue.size();
  }
  
  isEmpty(): boolean {
    return this.queue.isEmpty();
  }
  
  clear(): void {
    this.queue.clear();
  }
  
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    
    while (this.queue.size() > this.maxSize) {
      this.queue.dequeue();
    }
  }
}
```

### Priority Queue Implementation
```typescript
class PriorityQueue<T> {
  private items: T[] = [];
  private comparator: (a: T, b: T) => number;
  
  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }
  
  enqueue(item: T): void {
    this.items.push(item);
    this.items.sort(this.comparator);
  }
  
  dequeue(): T | null {
    if (this.items.length === 0) return null;
    return this.items.shift()!;
  }
  
  peek(): T | null {
    if (this.items.length === 0) return null;
    return this.items[0];
  }
  
  size(): number {
    return this.items.length;
  }
  
  isEmpty(): boolean {
    return this.items.length === 0;
  }
  
  clear(): void {
    this.items = [];
  }
}
```

## Message Enqueuing

### Enqueue Operation
```typescript
class MessageEnqueuer {
  private queueManager: QueueManager;
  
  constructor(queueManager: QueueManager) {
    this.queueManager = queueManager;
  }
  
  enqueue(data: any, priority: MessagePriority = MessagePriority.NORMAL): string {
    const message: Message = {
      id: crypto.randomUUID(),
      data,
      priority,
      attempts: 0,
      createdAt: new Date(),
      queuedAt: new Date(),
      metadata: new Map()
    };
    
    const success = this.queueManager.enqueue(message);
    
    if (!success) {
      throw new QueueFullError('Queue is full');
    }
    
    return message.id;
  }
  
  enqueueWithMetadata(data: any, priority: MessagePriority, metadata: Map<string, any>): string {
    const message: Message = {
      id: crypto.randomUUID(),
      data,
      priority,
      attempts: 0,
      createdAt: new Date(),
      queuedAt: new Date(),
      metadata
    };
    
    const success = this.queueManager.enqueue(message);
    
    if (!success) {
      throw new QueueFullError('Queue is full');
    }
    
    return message.id;
  }
}
```

## Message Dequeuing

### Dequeue Operation
```typescript
class MessageDequeuer {
  private queueManager: QueueManager;
  private handler: MessageHandler;
  
  constructor(queueManager: QueueManager, handler: MessageHandler) {
    this.queueManager = queueManager;
    this.handler = handler;
  }
  
  async dequeueAndProcess(): Promise<boolean> {
    const message = this.queueManager.dequeue();
    
    if (!message) {
      return false;
    }
    
    try {
      await this.handler.handle(message);
      return true;
    } catch (error) {
      message.attempts++;
      
      if (message.attempts < this.handler.getMaxRetries()) {
        this.queueManager.enqueue(message);
      }
      
      throw error;
    }
  }
}

interface MessageHandler {
  handle(message: Message): Promise<void>;
  getMaxRetries(): number;
}
```

## Best Practices

### Queue Design Guidelines
- Use priority for important messages
- Set appropriate queue size limits
- Monitor queue depth
- Implement backpressure handling
- Use efficient data structures

### Priority Guidelines
- Use URGENT for critical operations
- Use HIGH for important but not critical
- Use NORMAL for standard operations
- Use LOW for background tasks

### Performance Considerations
- Use efficient priority queue implementation
- Monitor queue processing time
- Implement batch processing when possible
- Use connection pooling for external services
