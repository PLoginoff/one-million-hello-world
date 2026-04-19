/**
 * Middleware Helpers
 * 
 * Utility functions for middleware operations.
 */

export class MiddlewareHelpers {
  /**
   * Wrap async handler with error handling
   */
  static wrapAsyncHandler(
    handler: (context: any) => Promise<any>,
    errorHandler?: (error: Error, context: any) => any
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      try {
        return await handler(context);
      } catch (error) {
        if (errorHandler) {
          return errorHandler(error as Error, context);
        }
        throw error;
      }
    };
  }

  /**
   * Wrap handler with timeout
   */
  static withTimeout(
    handler: (context: any) => Promise<any>,
    timeoutMs: number
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      return Promise.race([
        handler(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Middleware execution timeout')), timeoutMs)
        ),
      ]);
    };
  }

  /**
   * Wrap handler with retry logic
   */
  static withRetry(
    handler: (context: any) => Promise<any>,
    maxRetries: number = 3,
    delayMs: number = 100
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      let lastError: Error | undefined;
      
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await handler(context);
        } catch (error) {
          lastError = error as Error;
          if (i < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
          }
        }
      }
      
      throw lastError;
    };
  }

  /**
   * Compose multiple handlers
   */
  static composeHandlers(...handlers: Array<(context: any) => Promise<any> | any>): (context: any) => Promise<any> {
    return async (context: any) => {
      let currentContext = context;
      
      for (const handler of handlers) {
        currentContext = await handler(currentContext);
      }
      
      return currentContext;
    };
  }

  /**
   * Create conditional middleware
   */
  static conditional(
    condition: (context: any) => boolean,
    handler: (context: any) => Promise<any> | any
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      if (condition(context)) {
        return await handler(context);
      }
      return context;
    };
  }

  /**
   * Create middleware that runs on specific paths
   */
  static pathFilter(
    paths: string[],
    handler: (context: any) => Promise<any> | any
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      const requestPath = context.request?.path || '';
      const matches = paths.some(path => requestPath.startsWith(path));
      
      if (matches) {
        return await handler(context);
      }
      return context;
    };
  }

  /**
   * Create middleware that runs on specific methods
   */
  static methodFilter(
    methods: string[],
    handler: (context: any) => Promise<any> | any
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      const requestMethod = context.request?.method?.toLowerCase() || '';
      const matches = methods.some(method => method.toLowerCase() === requestMethod);
      
      if (matches) {
        return await handler(context);
      }
      return context;
    };
  }

  /**
   * Measure execution time of handler
   */
  static measureTime(
    handler: (context: any) => Promise<any> | any,
    onMeasure: (time: number, context: any) => void
  ): (context: any) => Promise<any> {
    return async (context: any) => {
      const startTime = Date.now();
      const result = await handler(context);
      const executionTime = Date.now() - startTime;
      onMeasure(executionTime, context);
      return result;
    };
  }

  /**
   * Deep clone context
   */
  static cloneContext<T>(context: T): T {
    return JSON.parse(JSON.stringify(context));
  }

  /**
   * Merge contexts
   */
  static mergeContexts<T>(base: T, override: Partial<T>): T {
    return { ...base, ...override };
  }
}
