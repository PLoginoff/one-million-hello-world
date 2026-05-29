/**
 * Circuit Breaker Errors
 * 
 * Custom error classes for circuit breaker operations.
 */

export class CircuitError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'CircuitError';
    this.code = code;
    this.context = context;
  }
}

export class CircuitOpenError extends CircuitError {
  constructor(message: string = 'Circuit is open', context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_OPEN', context);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitConfigError extends CircuitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_CONFIG_ERROR', context);
    this.name = 'CircuitConfigError';
  }
}

export class CircuitStateError extends CircuitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_STATE_ERROR', context);
    this.name = 'CircuitStateError';
  }
}

export class CircuitValidationError extends CircuitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_VALIDATION_ERROR', context);
    this.name = 'CircuitValidationError';
  }
}

export class CircuitMetricsError extends CircuitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_METRICS_ERROR', context);
    this.name = 'CircuitMetricsError';
  }
}

export class CircuitTimeoutError extends CircuitError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CIRCUIT_TIMEOUT', context);
    this.name = 'CircuitTimeoutError';
  }
}
