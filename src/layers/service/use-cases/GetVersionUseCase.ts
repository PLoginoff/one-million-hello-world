import { UseCase, ServiceResult, ServiceContext, ServiceError } from '../types/service-types';

export interface GetVersionInput {
  requestId: string;
  correlationId: string;
}

export interface GetVersionOutput {
  version: string;
  name: string;
  description: string;
  layers: number;
  environment: string;
  nodeVersion: string;
  timestamp: string;
}

export class GetVersionUseCase implements UseCase<GetVersionInput, GetVersionOutput> {
  readonly name = 'GetVersion';
  private readonly _version: string;
  private readonly _layers: number;

  constructor(version: string = '1.0.0', layers: number = 45) {
    this._version = version;
    this._layers = layers;
  }

  async execute(_input: GetVersionInput, _context: ServiceContext): Promise<ServiceResult<GetVersionOutput>> {
    try {
      const result: GetVersionOutput = {
        version: this._version,
        name: 'one-million-hello-world',
        description: 'A Hello World HTTP server with deep clean architecture and 85+ layers',
        layers: this._layers,
        environment:
          process.env.NODE_ENV !== undefined && process.env.NODE_ENV !== null && process.env.NODE_ENV !== ''
            ? process.env.NODE_ENV
            : 'development',
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      };
      return Promise.resolve({ success: true, data: result });
    } catch (error) {
      const errorResult: ServiceError = {
        code: 'VERSION_ERROR',
        message: error instanceof Error ? error.message : 'Version retrieval failed',
      };
      return Promise.resolve({ success: false, error: errorResult });
    }
  }
}
