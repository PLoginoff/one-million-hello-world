/**
 * YAML Serialization Strategy (Adapter)
 * 
 * Adapter for YAML serialization using a simple implementation.
 * In production, this would use a library like js-yaml.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export class YAMLStrategy implements ISerializationStrategy {
  serialize(data: unknown): string {
    return this._toYAML(data);
  }

  deserialize(data: string): unknown {
    return this._fromYAML(data);
  }

  getContentType(): ContentType {
    return 'application/yaml' as ContentType;
  }

  getFormatName(): string {
    return 'yaml';
  }

  canSerialize(data: unknown): boolean {
    try {
      this._toYAML(data);
      return true;
    } catch {
      return false;
    }
  }

  canDeserialize(data: string): boolean {
    try {
      this._fromYAML(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts data to YAML format (simple implementation)
   * 
   * @param data - Data to convert
   * @returns YAML string
   */
  private _toYAML(data: unknown, indent: number = 0): string {
    const spaces = ' '.repeat(indent * 2);

    if (data === null) {
      return 'null';
    }

    if (data === undefined) {
      return 'null';
    }

    if (typeof data === 'string') {
      return `"${data.replace(/"/g, '\\"')}"`;
    }

    if (typeof data === 'number') {
      return String(data);
    }

    if (typeof data === 'boolean') {
      return String(data);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return '[]';
      }
      return data
        .map(item => `${spaces}- ${this._toYAML(item, 0)}`)
        .join('\n');
    }

    if (typeof data === 'object') {
      const entries = Object.entries(data as Record<string, unknown>);
      if (entries.length === 0) {
        return '{}';
      }
      return entries
        .map(([key, value]) => `${spaces}${key}: ${this._toYAML(value, 0)}`)
        .join('\n');
    }

    return 'null';
  }

  /**
   * Converts YAML string to data (simple implementation)
   * 
   * @param data - YAML string
   * @returns Parsed data
   */
  private _fromYAML(data: string): unknown {
    const lines = data.trim().split('\n');
    return this._parseLines(lines, 0);
  }

  /**
   * Parses YAML lines into data structure
   * 
   * @param lines - Lines to parse
   * @param baseIndent - Base indentation level
   * @returns Parsed data
   */
  private _parseLines(lines: string[], baseIndent: number): unknown {
    if (lines.length === 0) {
      return null;
    }

    const firstLine = lines[0];
    const indent = firstLine.search(/\S/);

    if (firstLine.trim().startsWith('- ')) {
      return this._parseArray(lines, baseIndent);
    }

    if (firstLine.includes(':')) {
      return this._parseObject(lines, baseIndent);
    }

    return this._parseValue(firstLine.trim());
  }

  /**
   * Parses array from YAML lines
   * 
   * @param lines - Lines to parse
   * @param baseIndent - Base indentation level
   * @returns Parsed array
   */
  private _parseArray(lines: string[], baseIndent: number): unknown[] {
    const result: unknown[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const indent = line.search(/\S/);

      if (indent < baseIndent) {
        break;
      }

      if (line.trim().startsWith('- ')) {
        const valueStr = line.trim().substring(2);
        const value = this._parseValue(valueStr);
        result.push(value);
        i++;
      } else {
        i++;
      }
    }

    return result;
  }

  /**
   * Parses object from YAML lines
   * 
   * @param lines - Lines to parse
   * @param baseIndent - Base indentation level
   * @returns Parsed object
   */
  private _parseObject(lines: string[], baseIndent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const indent = line.search(/\S/);

      if (indent < baseIndent) {
        break;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        const key = line.substring(indent, colonIndex).trim();
        const valueStr = line.substring(colonIndex + 1).trim();

        if (valueStr === '' || valueStr === '|') {
          const childLines = this._getChildLines(lines, i + 1, indent + 2);
          result[key] = this._parseLines(childLines, indent + 2);
          i += childLines.length + 1;
        } else {
          result[key] = this._parseValue(valueStr);
          i++;
        }
      } else {
        i++;
      }
    }

    return result;
  }

  /**
   * Gets child lines for nested structures
   * 
   * @param lines - All lines
   * @param startIndex - Start index
   * @param minIndent - Minimum indentation
   * @returns Child lines
   */
  private _getChildLines(lines: string[], startIndex: number, minIndent: number): string[] {
    const childLines: string[] = [];
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      const indent = line.search(/\S/);

      if (indent < minIndent) {
        break;
      }

      childLines.push(line);
      i++;
    }

    return childLines;
  }

  /**
   * Parses a value string
   * 
   * @param value - Value string
   * @returns Parsed value
   */
  private _parseValue(value: string): unknown {
    if (value === 'null' || value === '~') {
      return null;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }

    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }

    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }

    return value;
  }
}
