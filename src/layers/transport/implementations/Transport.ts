/**
 * Transport Implementation
 * 
 * Concrete implementation of ITransport.
 * Handles HTTP response, streaming, and chunked encoding.
 */

import { ITransport } from '../interfaces/ITransport';
import { TransportResult, TransportConfig } from '../types/transport-types';

export class Transport implements ITransport {
  private _config: TransportConfig;

  constructor() {
    this._config = {
      enableStreaming: false,
      enableChunkedEncoding: false,
    };
  }

  async send(data: string, status: number = 200): Promise<TransportResult> {
    try {
      let processedData = data;

      if (this._config.enableChunkedEncoding) {
        processedData = this._applyChunkedEncoding(data);
      }

      return {
        success: true,
        data: processedData,
        status,
      };
    } catch (error) {
      return {
        success: false,
        status: 500,
        error: error instanceof Error ? error.message : 'Transport send failed',
      };
    }
  }

  setConfig(config: TransportConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): TransportConfig {
    return { ...this._config };
  }

  private _applyChunkedEncoding(data: string): string {
    const chunkSize = 1024;
    const chunks: string[] = [];

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.substring(i, i + chunkSize);
      chunks.push(chunk);
    }

    return chunks.join('\r\n');
  }
}
