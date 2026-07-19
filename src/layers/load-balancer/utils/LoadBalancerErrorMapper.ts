import { LoadBalancerError } from './LoadBalancerError';

export interface MappedLoadBalancerError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class LoadBalancerErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | LoadBalancerError): MappedLoadBalancerError {
    if (error instanceof LoadBalancerError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected load-balancer error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | LoadBalancerError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
