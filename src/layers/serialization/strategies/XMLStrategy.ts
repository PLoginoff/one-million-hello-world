/**
 * XML Serialization Strategy
 * 
 * Implements basic XML serialization and deserialization.
 */

import { ISerializationStrategy } from './ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export class XMLStrategy implements ISerializationStrategy {
  serialize(data: unknown): string {
    return this._toXML(data);
  }

  deserialize(data: string): unknown {
    return this._fromXML(data);
  }

  getContentType(): ContentType {
    return ContentType.XML;
  }

  getFormatName(): string {
    return 'xml';
  }

  canSerialize(data: unknown): boolean {
    return typeof data === 'object' || data === null || typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean';
  }

  canDeserialize(data: string): boolean {
    return data.trim().startsWith('<') && data.trim().endsWith('>');
  }

  private _toXML(data: unknown, tagName: string = 'root'): string {
    if (data === null || data === undefined) {
      return `<${tagName} />`;
    }

    if (typeof data !== 'object') {
      return `<${tagName}>${this._escapeXML(String(data))}</${tagName}>`;
    }

    const obj = data as Record<string, unknown>;
    let xml = `<${tagName}>`;

    for (const [key, value] of Object.entries(obj)) {
      xml += this._toXML(value, key);
    }

    xml += `</${tagName}>`;
    return xml;
  }

  private _fromXML(data: string): unknown {
    const result: Record<string, unknown> = {};
    const regex = /<(\w+)>(.*?)<\/\1>/g;
    let match;

    while ((match = regex.exec(data)) !== null) {
      const [, key, value] = match;
      result[key] = this._unescapeXML(value);
    }

    return result;
  }

  private _escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private _unescapeXML(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}
