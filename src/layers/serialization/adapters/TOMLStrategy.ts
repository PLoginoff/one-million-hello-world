/**
 * TOML Serialization Strategy
 * 
 * Adapter for TOML serialization format.
 */

import { ISerializationStrategy } from '../../interfaces/ISerializationStrategy';
import { ContentType } from '../../types/serialization-types';

export class TOMLStrategy implements ISerializationStrategy {
  serialize(data: unknown): string {
    if (!this.canSerialize(data)) {
      throw new Error('Cannot serialize data as TOML');
    }

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('TOML requires an object as root');
    }

    return this._objectToTOML(data as Record<string, unknown>, '');
  }

  deserialize(data: string): unknown {
    if (!this.canDeserialize(data)) {
      throw new Error('Cannot deserialize data as TOML');
    }

    return this._tomlToObject(data);
  }

  getContentType(): ContentType {
    return ContentType.TEXT;
  }

  getFormatName(): string {
    return 'toml';
  }

  canSerialize(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    if (Array.isArray(data)) {
      return false;
    }

    return this._isSerializableObject(data as Record<string, unknown>);
  }

  canDeserialize(data: string): boolean {
    try {
      this._tomlToObject(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts object to TOML string
   */
  private _objectToTOML(obj: Record<string, unknown>, indent: string): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'string') {
        lines.push(`${indent}${key} = "${this._escapeString(value)}"`);
      } else if (typeof value === 'boolean') {
        lines.push(`${indent}${key} = ${value}`);
      } else if (typeof value === 'number') {
        lines.push(`${indent}${key} = ${value}`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${indent}${key} = []`);
        } else {
          const arrayStr = this._arrayToTOML(value);
          lines.push(`${indent}${key} = ${arrayStr}`);
        }
      } else if (typeof value === 'object') {
        if (this._isSimpleObject(value as Record<string, unknown>)) {
          const nestedStr = this._objectToTOML(value as Record<string, unknown>, indent);
          lines.push(`${indent}${key} = { ${nestedStr.trim()} }`);
        } else {
          lines.push(`${indent}[${key}]`);
          lines.push(this._objectToTOML(value as Record<string, unknown>, indent + '  '));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Converts array to TOML array string
   */
  private _arrayToTOML(arr: unknown[]): string {
    const items = arr.map(item => {
      if (typeof item === 'string') {
        return `"${this._escapeString(item)}"`;
      } else if (typeof item === 'boolean' || typeof item === 'number') {
        return String(item);
      } else {
        return '{}';
      }
    });
    return `[${items.join(', ')}]`;
  }

  /**
   * Escapes string for TOML
   */
  private _escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Checks if object is simple (flat)
   */
  private _isSimpleObject(obj: Record<string, unknown>): boolean {
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if object is serializable
   */
  private _isSerializableObject(obj: Record<string, unknown>): boolean {
    for (const value of Object.values(obj)) {
      if (value === null || value === undefined) {
        continue;
      }
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        !Array.isArray(value) &&
        typeof value !== 'object'
      ) {
        return false;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        if (!this._isSerializableObject(value as Record<string, unknown>)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Parses TOML string to object (simplified implementation)
   */
  private _tomlToObject(toml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = toml.split('\n');
    let currentSection = result;

    for (let line of lines) {
      line = line.trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      if (line.startsWith('[') && line.endsWith(']')) {
        const sectionName = line.slice(1, -1);
        currentSection = result;
        const parts = sectionName.split('.');
        for (const part of parts) {
          if (!currentSection[part]) {
            currentSection[part] = {};
          }
          if (typeof currentSection[part] === 'object') {
            currentSection = currentSection[part] as Record<string, unknown>;
          }
        }
        continue;
      }

      const equalIndex = line.indexOf('=');
      if (equalIndex > -1) {
        const key = line.slice(0, equalIndex).trim();
        const valueStr = line.slice(equalIndex + 1).trim();
        currentSection[key] = this._parseValue(valueStr);
      }
    }

    return result;
  }

  /**
   * Parses value from TOML string
   */
  private _parseValue(str: string): unknown {
    str = str.trim();

    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    }
    if (str.startsWith('[') && str.endsWith(']')) {
      return this._parseArray(str);
    }
    if (str.startsWith('{') && str.endsWith('}')) {
      return this._parseInlineTable(str);
    }

    const num = Number(str);
    if (!isNaN(num)) {
      return num;
    }

    return str;
  }

  /**
   * Parses array from TOML string
   */
  private _parseArray(str: string): unknown[] {
    const inner = str.slice(1, -1).trim();
    if (!inner) return [];

    const items: unknown[] = [];
    let current = '';
    let inString = false;
    let depth = 0;

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];

      if (char === '"' && (i === 0 || inner[i - 1] !== '\\')) {
        inString = !inString;
      }

      if (!inString) {
        if (char === '[' || char === '{') {
          depth++;
        } else if (char === ']' || char === '}') {
          depth--;
        } else if (char === ',' && depth === 0) {
          items.push(this._parseValue(current.trim()));
          current = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      items.push(this._parseValue(current.trim()));
    }

    return items;
  }

  /**
   * Parses inline table from TOML string
   */
  private _parseInlineTable(str: string): Record<string, unknown> {
    const inner = str.slice(1, -1).trim();
    const result: Record<string, unknown> = {};
    let current = '';
    let inString = false;
    let depth = 0;

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];

      if (char === '"' && (i === 0 || inner[i - 1] !== '\\')) {
        inString = !inString;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
        } else if (char === '=' && depth === 0) {
          const key = current.trim();
          current = '';
          const valueStart = i + 1;
          let valueEnd = valueStart;
          let valueDepth = 0;
          let valueInString = false;

          for (let j = valueStart; j < inner.length; j++) {
            const vChar = inner[j];
            if (vChar === '"' && (j === 0 || inner[j - 1] !== '\\')) {
              valueInString = !valueInString;
            }
            if (!valueInString) {
              if (vChar === '{' || vChar === '[') {
                valueDepth++;
              } else if (vChar === '}' || vChar === ']') {
                valueDepth--;
              } else if (vChar === ',' && valueDepth === 0) {
                valueEnd = j;
                break;
              }
            }
          }

          const valueStr = inner.slice(valueStart, valueEnd).trim();
          result[key] = this._parseValue(valueStr);
          i = valueEnd;
          current = '';
          continue;
        }
      }

      current += char;
    }

    return result;
  }
}
