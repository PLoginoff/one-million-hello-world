# Dead Letter Queue

## Overview
The Message Queue Layer implements a dead letter queue for failed message storage with configurable dead letter enablement, dead letter statistics, and dead letter retrieval.

## Dead Letter Queue Structure

### Dead Letter Message
```typescript
interface DeadLetterMessage extends Message {
  failedAt: Date;
  failureReason: string;
  error: Error;
  lastAttempt: number;
}

interface DeadLetterQueue {
  messages: DeadLetterMessage[];
  maxSize: number;
  enabled: boolean;
}
```

### Dead Letter Queue Manager
```typescript
class DeadLetterQueueManager {
  private deadLetterQueue: DeadLetterQueue;
  
  constructor(maxSize: number, enabled: boolean = true) {
    this.deadLetterQueue = {
      messages: [],
      maxSize,
      enabled
    };
  }
  
  add(message: Message, error: Error): void {
    if (!this.deadLetterQueue.enabled) {
      return;
    }
    
    const deadLetterMessage: DeadLetterMessage = {
      ...message,
      failedAt: new Date(),
      failureReason: error.message,
      error,
      lastAttempt: message.attempts
    };
    
    if (this.deadLetterQueue.messages.length >= this.deadLetterQueue.maxSize) {
      this.deadLetterQueue.messages.shift();
    }
    
    this.deadLetterQueue.messages.push(deadLetterMessage);
  }
  
  get(messageId: string): DeadLetterMessage | undefined {
    return this.deadLetterQueue.messages.find(m => m.id === messageId);
  }
  
  getAll(): DeadLetterMessage[] {
    return [...this.deadLetterQueue.messages];
  }
  
  remove(messageId: string): boolean {
    const index = this.deadLetterQueue.messages.findIndex(m => m.id === messageId);
    
    if (index !== -1) {
      this.deadLetterQueue.messages.splice(index, 1);
      return true;
    }
    
    return false;
  }
  
  clear(): void {
    this.deadLetterQueue.messages = [];
  }
  
  size(): number {
    return this.deadLetterQueue.messages.length;
  }
  
  isEmpty(): boolean {
    return this.deadLetterQueue.messages.length === 0;
  }
  
  enable(): void {
    this.deadLetterQueue.enabled = true;
  }
  
  disable(): void {
    this.deadLetterQueue.enabled = false;
  }
  
  isEnabled(): boolean {
    return this.deadLetterQueue.enabled;
  }
  
  setMaxSize(maxSize: number): void {
    this.deadLetterQueue.maxSize = maxSize;
    
    while (this.deadLetterQueue.messages.length > maxSize) {
      this.deadLetterQueue.messages.shift();
    }
  }
}
```

## Dead Letter Statistics

### Statistics
```typescript
interface DeadLetterStatistics {
  totalDeadLetters: number;
  deadLettersByFailureReason: Map<string, number>;
  deadLettersByPriority: Map<MessagePriority, number>;
  oldestDeadLetter: Date | null;
  newestDeadLetter: Date | null;
}

class DeadLetterStatisticsTracker {
  private deadLetterQueue: DeadLetterQueue;
  
  constructor(deadLetterQueue: DeadLetterQueue) {
    this.deadLetterQueue = deadLetterQueue;
  }
  
  getStatistics(): DeadLetterStatistics {
    const messages = this.deadLetterQueue.messages;
    
    const deadLettersByFailureReason = new Map<string, number>();
    const deadLettersByPriority = new Map<MessagePriority, number>();
    
    let oldestDeadLetter: Date | null = null;
    let newestDeadLetter: Date | null = null;
    
    for (const message of messages) {
      const reasonCount = deadLettersByFailureReason.get(message.failureReason) || 0;
      deadLettersByFailureReason.set(message.failureReason, reasonCount + 1);
      
      const priorityCount = deadLettersByPriority.get(message.priority) || 0;
      deadLettersByPriority.set(message.priority, priorityCount + 1);
      
      if (!oldestDeadLetter || message.failedAt < oldestDeadLetter) {
        oldestDeadLetter = message.failedAt;
      }
      
      if (!newestDeadLetter || message.failedAt > newestDeadLetter) {
        newestDeadLetter = message.failedAt;
      }
    }
    
    return {
      totalDeadLetters: messages.length,
      deadLettersByFailureReason,
      deadLettersByPriority,
      oldestDeadLetter,
      newestDeadLetter
    };
  }
}
```

## Dead Letter Retrieval

### Retrieval Manager
```typescript
class DeadLetterRetrievalManager {
  private deadLetterQueueManager: DeadLetterQueueManager;
  
  constructor(deadLetterQueueManager: DeadLetterQueueManager) {
    this.deadLetterQueueManager = deadLetterQueueManager;
  }
  
  retrieve(messageId: string): DeadLetterMessage | undefined {
    const message = this.deadLetterQueueManager.get(messageId);
    
    if (message) {
      this.deadLetterQueueManager.remove(messageId);
    }
    
    return message;
  }
  
  retrieveAll(): DeadLetterMessage[] {
    const messages = this.deadLetterQueueManager.getAll();
    this.deadLetterQueueManager.clear();
    return messages;
  }
  
  retrieveByFailureReason(reason: string): DeadLetterMessage[] {
    const messages = this.deadLetterQueueManager.getAll()
      .filter(m => m.failureReason === reason);
    
    for (const message of messages) {
      this.deadLetterQueueManager.remove(message.id);
    }
    
    return messages;
  }
  
  retrieveByPriority(priority: MessagePriority): DeadLetterMessage[] {
    const messages = this.deadLetterQueueManager.getAll()
      .filter(m => m.priority === priority);
    
    for (const message of messages) {
      this.deadLetterQueueManager.remove(message.id);
    }
    
    return messages;
  }
  
  retry(messageId: string): Message | undefined {
    const deadLetter = this.retrieve(messageId);
    
    if (!deadLetter) {
      return undefined;
    }
    
    const message: Message = {
      ...deadLetter,
      attempts: 0
    };
    
    return message;
  }
}
```

## Best Practices

### Dead Letter Queue Guidelines
- Enable dead letter queue for error tracking
- Set appropriate max size
- Monitor dead letter count
- Review dead letters periodically
- Implement alerting for high dead letter rates

### Retrieval Guidelines
- Retrieve messages for manual inspection
- Retry messages after fixing issues
- Clear old dead letters periodically
- Document failure reasons
- Analyze failure patterns

### Performance Considerations
- Monitor dead letter queue size
- Set appropriate size limits
- Implement automatic cleanup
- Monitor retrieval performance
