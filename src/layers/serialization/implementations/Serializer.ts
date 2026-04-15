/**
 * Serializer Implementation
 * 
 * Concrete implementation of ISerializer.
 * Handles response serialization, versioning, and content negotiation.
 */

import { ISerializer } from '../interfaces/ISerializer';
import {
  ContentType,
  SerializationFormat,
  SerializationResult,
  SerializationConfig,
} from '../types/serialization-types';

export class Serializer implements ISerializer {
  private _config: SerializationConfig;

  constructor() {
    this._config = {
      defaultFormat: SerializationFormat.JSON,
      enableVersioning: false,
      currentVersion: '1.0',
    };
  }

  serialize<T>(data: T, format?: SerializationFormat): SerializationResult {
    const targetFormat = format ?? this._config.defaultFormat;

    try {
      let serialized: string;
      let contentType: ContentType;

      switch (targetFormat) {
        case SerializationFormat.JSON:
          serialized = JSON.stringify(data);
          contentType = ContentType.JSON;
          break;
        case SerializationFormat.XML:
          serialized = this._toXML(data);
          contentType = ContentType.XML;
          break;
        case SerializationFormat.STRING:
          serialized = String(data);
          contentType = ContentType.PLAIN_TEXT;
          break;
        default:
          return {
            success: false,
            error: 'Unsupported serialization format',
          };
      }

      if (this._config.enableVersioning) {
        serialized = JSON.stringify({ version: this._config.currentVersion, data: JSON.parse(serialized) });
      }

      return { success: true, data: serialized, contentType };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Serialization failed',
      };
    }
  }

  deserialize<T>(data: string, format: SerializationFormat): SerializationResult & { data?: T } {
    try {
      let parsed: unknown;

      switch (format) {
        case SerializationFormat.JSON:
          parsed = JSON.parse(data);
          break;
        case SerializationFormat.XML:
          return {
            success: false,
            error: 'XML deserialization not implemented',
          };
        case SerializationFormat.STRING:
          parsed = data;
          break;
        default:
          return {
            success: false,
            error: 'Unsupported deserialization format',
          };
      }

      if (this._config.enableVersioning && typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
        parsed = (parsed as Record<string, unknown>)['data'];
      }

      return { success: true, data: parsed as unknown as T };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deserialization failed',
      };
    }
  }

  negotiateContentType(acceptHeader: string): ContentType {
    const acceptedTypes = acceptHeader.split(',').map((t) => t.trim());

    for (const type of acceptedTypes) {
      if (type.includes('application/json')) {
        return ContentType.JSON;
      }
      if (type.includes('application/xml')) {
        return ContentType.XML;
      }
      if (type.includes('text/html')) {
        return ContentType.HTML;
      }
      if (type.includes('text/plain')) {
        return ContentType.PLAIN_TEXT;
      }
    }

    return ContentType.JSON;
  }

  setConfig(config: SerializationConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): SerializationConfig {
    return { ...this._config };
  }

  private _toXML(data: unknown): string {
    if (typeof data !== 'object' || data === null) {
      return `<root>${String(data)}</root>`;
    }

    const obj = data as Record<string, unknown>;
    let xml = '<root>';

    for (const [key, value] of Object.entries(obj)) {
      xml += `<${key}>${String(value)}</${key}>`;
    }

    xml += '</root>';
    return xml;
  }
}
