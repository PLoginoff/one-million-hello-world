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
    return (
      typeof data === 'object' ||
      data === null ||
      typeof data === 'string' ||
      typeof data === 'number' ||
      typeof data === 'boolean'
    );
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
    const trimmed = data.trim();
    const rootMatch = trimmed.match(/^<(\w+)>(.*?)<\/\1>$/s) ?? trimmed.match(/^<(\w+) \/>$/s);
    if (!rootMatch) {
      return {};
    }

    const rootTag = rootMatch[1] ?? 'root';
    const inner = rootMatch[2] ?? '';
    const innerTrimmed = inner.trim();

    if (!innerTrimmed) {
      return {};
    }

    const childRegex = /<(\w+)>(.*?)<\/\1>/gs;
    const children: Array<[string, string]> = [];
    let childMatch;
    while ((childMatch = childRegex.exec(inner)) !== null) {
      children.push([childMatch[1], childMatch[2]]);
    }

    if (children.length === 0) {
      return { [rootTag]: this._unescapeXML(innerTrimmed) };
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of children) {
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
