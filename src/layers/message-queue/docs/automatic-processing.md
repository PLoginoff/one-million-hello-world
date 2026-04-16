# Automatic Processing

## Overview
The Message Queue Layer implements automatic processing with handler registration, start/stop processing control, processing state management, and concurrent processing prevention.

## Processing State

### Processing State
```typescript
enum ProcessingState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  PAUSED = 'paused',
  STOPPED = 'stopped'
}

interface ProcessingContext {
  state: ProcessingState;
  handler: MessageHandler | null;
  startTime: Date | null;
  processedCount: number;
  errorCount: number;
}
```

### Processing Controller
```typescript
class ProcessingController {
  private context: ProcessingContext;
  private queueManager: QueueManager;
  private deadLetterQueueManager: DeadLetterQueueManager;
  private retryHandler: RetryHandler;
  private processingLoop: NodeJS.Timeout | null = null;
  
  constructor(
    queueManager: QueueManager,
    deadLetterQueueManager: DeadLetterQueueManager,
    retryHandler: RetryHandler
  ) {
    this.context = {
      state: ProcessingState.IDLE,
      handler: null,
      startTime: null,
      processedCount: 0,
      errorCount: 0
    };
    
    this.queueManager = queueManager;
    this.deadLetterQueueManager = deadLetterQueueManager;
    this.retryHandler = retryHandler;
  }
  
  registerHandler(handler: MessageHandler): void {
    this.context.handler = handler;
  }
  
  start(interval: number = 100): void {
    if (this.context.state === ProcessingState.PROCESSING) {
      return;
    }
    
    this.context.state = ProcessingState.PROCESSING;
    this.context.startTime = new Date();
    
    this.processingLoop = setInterval(() => {
      this.processNextMessage();
    }, interval);
  }
  
  stop(): void {
    if (this.processingLoop) {
      clearInterval(this.processingLoop);
      this.processingLoop = null;
    }
    
    this.context.state = ProcessingState.STOPPED;
  }
  
  pause(): void {
    if (this.processingLoop) {
      clearInterval(this.processingLoop);
      this.processingLoop = null;
    }
    
    this.context.state = ProcessingState.PAUSED;
  }
  
  resume(interval: number = 100): void {
    if (this.context.state !== ProcessingState.PAUSED) {
      return;
    }
    
    this.start(interval);
  }
  
  private async processNextMessage(): Promise<void> {
    if (this.context.state !== ProcessingState.PROCESSING) {
      return;
    }
    
    if (!this.context.handler) {
      return;
    }
    
    const message = this.queueManager.dequeue();
    
    if (!message) {
      return;
    }
    
    try {
      await this.retryHandler.handleWithRetry(message, this.context.handler);
      this.context.processedCount++;
    } catch (error) {
      this.context.errorCount++;
      this.deadLetterQueueManager.add(message, error as Error);
    }
  }
  
  getState(): ProcessingState {
    return this.context.state;
  }
  
  getStatistics(): {
    processedCount: number;
    errorCount: number;
    startTime: Date | null;
  } {
    return {
      processedCount: this.context.processedCount,
      errorCount: this.context.errorCount,
      startTime: this.context.startTime
    };
  }
  
  resetStatistics(): void {
    this.context.processedCount = 0;
    this.context.errorCount = 0;
    this.context.startTime = null;
  }
}
```

## Handler Registration

### Handler Registry
```typescript
class HandlerRegistry {
  private handlers: Map<string, MessageHandler> = new Map();
  
  register(name: string, handler: MessageHandler): void {
    this.handlers.set(name, handler);
  }
  
  unregister(name: string): void {
    this.handlers.delete(name);
  }
  
  get(name: string): MessageHandler | undefined {
    return this.handlers.get(name);
  }
  
  has(name: string): boolean {
    return this.handlers.has(name);
  }
  
  getAll(): Map<string, MessageHandler> {
    return new Map(this.handlers);
  }
  
  clear(): void {
    this.handlers.clear();
  }
}
```

## Concurrent Processing Prevention

### Concurrency Manager
```typescript
class ConcurrencyManager {
  private processing: boolean = false;
  private lock: Promise<void> | null = null;
  
  async acquire(): Promise<void> {
    while (this.processing) {
      await this.lock;
    }
    
    this.processing = true;
    this.lock = new Promise(resolve => {
      this.lock = resolve;
    });
  }
  
  release(): void {
    this.processing = false;
    
    if (this.lock) {
      const resolve = this.lock;
      this.lock = null;
      resolve();
    }
  }
  
  isProcessing(): boolean {
    return this.processing;
  }
}
```

## Best Practices

### Processing Guidelines
- Register handlers before starting processing
- Monitor processing statistics
- Handle errors gracefully
- Implement backpressure handling
- Monitor queue depth

### Handler Registration Guidelines
- Use descriptive handler names
- Document handler behavior
- Implement proper error handling
- Set appropriate retry limits
- Monitor handler performance

### Concurrency Guidelines
- Prevent concurrent message processing
- Use locks for critical sections
- Monitor processing state
- Implement graceful shutdown
