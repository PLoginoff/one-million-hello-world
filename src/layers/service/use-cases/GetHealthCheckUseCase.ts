import { UseCase, ServiceResult, ServiceContext, ServiceError } from '../types/service-types';
import { HealthCheck } from '../../domain/entities/HealthCheck';

export interface GetHealthCheckInput {
  requestId: string;
  correlationId: string;
}

export interface GetHealthCheckOutput {
  status: string;
  version: string;
  components: Array<{
    name: string;
    status: string;
    latencyMs: number;
  }>;
  timestamp: string;
}

export class GetHealthCheckUseCase implements UseCase<GetHealthCheckInput, GetHealthCheckOutput> {
  readonly name = 'GetHealthCheck';
  private readonly _version: string;
  private readonly _layerCount: number;

  constructor(version: string = '1.0.0', layerCount: number = 45) {
    this._version = version;
    this._layerCount = layerCount;
  }

  async execute(input: GetHealthCheckInput, context: ServiceContext): Promise<ServiceResult<GetHealthCheckOutput>> {
    try {
      const health = HealthCheck.healthy(this._version);
      const result: GetHealthCheckOutput = {
        status: health.status,
        version: health.version,
        components: health.components.map((c) => ({
          name: c.name,
          status: c.status,
          latencyMs: c.latencyMs,
        })),
        timestamp: new Date().toISOString(),
      };
      return { success: true, data: result };
    } catch (error) {
      const errorResult: ServiceError = {
        code: 'HEALTH_CHECK_ERROR',
        message: error instanceof Error ? error.message : 'Health check failed',
      };
      return { success: false, error: errorResult };
    }
  }
}
