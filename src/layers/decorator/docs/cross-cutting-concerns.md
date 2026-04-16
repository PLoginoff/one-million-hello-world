# Cross-Cutting Concerns

## Overview
The Decorator Layer implements cross-cutting concerns with logging decorator, metrics decorator, extensible decorator system, and decorator chaining.

### Logging Decorator
```typescript
class LoggingDecorator<T> implements Decorator<T> {
  name = 'logging';
  
  apply(target: T): T {
    return new Proxy(target, {
      apply: (target, thisArg, args) => {
        console.log(`[LOG] Calling ${args[0]} with args:`, args.slice(1));
        const result = Reflect.apply(target, thisArg, args);
        console.log(`[LOG] Result:`, result);
        return result;
      }
    }) as any;
  }
}
```

### Metrics Decorator
```typescript
class MetricsDecorator<T> implements Decorator<T> {
  name = 'metrics';
  private metrics: Map<string, number> = new Map();
  
  apply(target: T): T {
    return new Proxy(target, {
      apply: (target, thisArg, args) => {
        const start = Date.now();
        const result = Reflect.apply(target, thisArg, args);
        const duration = Date.now() - start;
        
        this.metrics.set(args[0], duration);
        
        return result;
      }
    }) as any;
  }
  
  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }
}
```

## Best Practices

### Cross-Cutting Guidelines
- Use logging for debugging
- Use metrics for monitoring
- Chain decorators appropriately
- Monitor decorator overhead
