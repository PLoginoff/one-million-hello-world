import { UseCase, ServiceResult, ServiceContext, ServiceError } from '../types/service-types';

export interface GetMetricsInput {
  requestId: string;
  correlationId: string;
}

export interface GetMetricsOutput {
  totalLayers: number;
  activeLayers: number;
  totalRequests: number;
  uptimeSeconds: number;
  memoryUsage: Record<string, number>;
  timestamp: string;
}

export class GetMetricsUseCase implements UseCase<GetMetricsInput, GetMetricsOutput> {
  readonly name = 'GetMetrics';
  private readonly _totalLayers: number;
  private readonly _startTime: Date;
  private _requestCount: number;

  constructor(totalLayers: number = 45) {
    this._totalLayers = totalLayers;
    this._startTime = new Date();
    this._requestCount = 0;
  }

  async execute(input: GetMetricsInput, context: ServiceContext): Promise<ServiceResult<GetMetricsOutput>> {
    try {
      this._requestCount++;
      const memoryUsage = process.memoryUsage();

      const result: GetMetricsOutput = {
        totalLayers: this._totalLayers,
        activeLayers: this._totalLayers,
        totalRequests: this._requestCount,
        uptimeSeconds: Math.floor((Date.now() - this._startTime.getTime()) / 1000),
        memoryUsage: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
        },
        timestamp: new Date().toISOString(),
      };
      return { success: true, data: result };
    } catch (error) {
      const errorResult: ServiceError = {
        code: 'METRICS_ERROR',
        message: error instanceof Error ? error.message : 'Metrics collection failed',
      };
      return { success: false, error: errorResult };
    }
  }
}
