/**
 * MessagePack Serialization Strategy (Adapter)
 * 
 * Adapter for MessagePack serialization using a simple implementation.
 * In production, this would use a library like msgpack-lite.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export class MessagePackStrategy implements ISerializationStrategy {
  serialize(data: unknown): string {
    const buffer = this._encode(data);
    return Buffer.from(buffer).toString('base64');
  }

  deserialize(data: string): unknown {
    const buffer = Buffer.from(data, 'base64');
    return this._decode(Array.from(buffer));
  }

  getContentType(): ContentType {
    return 'application/msgpack' as ContentType;
  }

  getFormatName(): string {
    return 'msgpack';
  }

  canSerialize(data: unknown): boolean {
    try {
      this._encode(data);
      return true;
    } catch {
      return false;
    }
  }

  canDeserialize(data: string): boolean {
    try {
      const buffer = Buffer.from(data, 'base64');
      this._decode(Array.from(buffer));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Encodes data to MessagePack format (simplified)
   * 
   * @param data - Data to encode
   * @returns Encoded byte array
   */
  private _encode(data: unknown): number[] {
    if (data === null) {
      return [0xc0];
    }

    if (data === undefined) {
      return [0xc0];
    }

    if (typeof data === 'boolean') {
      return data ? [0xc3] : [0xc2];
    }

    if (typeof data === 'number') {
      if (Number.isInteger(data) && data >= -32 && data <= 127) {
        return [data];
      }
      if (Number.isInteger(data) && data >= 0 && data <= 255) {
        return [0xcc, data];
      }
      if (Number.isInteger(data) && data >= 0 && data <= 65535) {
        return [0xcd, data >> 8, data & 0xff];
      }
      return this._encodeNumber(data);
    }

    if (typeof data === 'string') {
      return this._encodeString(data);
    }

    if (Array.isArray(data)) {
      return this._encodeArray(data);
    }

    if (typeof data === 'object') {
      return this._encodeObject(data as Record<string, unknown>);
    }

    return [0xc0];
  }

  /**
   * Encodes a number
   * 
   * @param num - Number to encode
   * @returns Encoded byte array
   */
  private _encodeNumber(num: number): number[] {
    const buffer = Buffer.alloc(8);
    buffer.writeDoubleBE(num);
    return [0xcb, ...Array.from(buffer)];
  }

  /**
   * Encodes a string
   * 
   * @param str - String to encode
   * @returns Encoded byte array
   */
  private _encodeString(str: string): number[] {
    const bytes = Buffer.from(str, 'utf8');
    const length = bytes.length;

    if (length <= 31) {
      return [0xa0 | length, ...Array.from(bytes)];
    }

    if (length <= 255) {
      return [0xd9, length, ...Array.from(bytes)];
    }

    if (length <= 65535) {
      return [0xda, length >> 8, length & 0xff, ...Array.from(bytes)];
    }

    return [0xdb, ...this._encodeUint32(length), ...Array.from(bytes)];
  }

  /**
   * Encodes an array
   * 
   * @param arr - Array to encode
   * @returns Encoded byte array
   */
  private _encodeArray(arr: unknown[]): number[] {
    const length = arr.length;

    if (length <= 15) {
      return [0x90 | length, ...arr.flatMap(item => this._encode(item))];
    }

    if (length <= 65535) {
      return [0xdc, length >> 8, length & 0xff, ...arr.flatMap(item => this._encode(item))];
    }

    return [0xdd, ...this._encodeUint32(length), ...arr.flatMap(item => this._encode(item))];
  }

  /**
   * Encodes an object
   * 
   * @param obj - Object to encode
   * @returns Encoded byte array
   */
  private _encodeObject(obj: Record<string, unknown>): number[] {
    const entries = Object.entries(obj);
    const length = entries.length;

    if (length <= 15) {
      return [0x80 | length, ...entries.flatMap(([key, value]) => [
        ...this._encode(key),
        ...this._encode(value)
      ])];
    }

    if (length <= 65535) {
      return [0xde, length >> 8, length & 0xff, ...entries.flatMap(([key, value]) => [
        ...this._encode(key),
        ...this._encode(value)
      ])];
    }

    return [0xdf, ...this._encodeUint32(length), ...entries.flatMap(([key, value]) => [
      ...this._encode(key),
      ...this._encode(value)
    ])];
  }

  /**
   * Encodes a 32-bit unsigned integer
   * 
   * @param num - Number to encode
   * @returns Encoded byte array
   */
  private _encodeUint32(num: number): number[] {
    return [
      (num >> 24) & 0xff,
      (num >> 16) & 0xff,
      (num >> 8) & 0xff,
      num & 0xff
    ];
  }

  /**
   * Decodes MessagePack data
   * 
   * @param data - Byte array to decode
   * @returns Decoded data
   */
  private _decode(data: number[]): unknown {
    if (data.length === 0) {
      return null;
    }

    const byte = data[0];
    const result = this._decodeValue(data, 0);
    return result.value;
  }

  /**
   * Decodes a value from byte array
   * 
   * @param data - Byte array
   * @param offset - Current offset
   * @returns Decoded value and new offset
   */
  private _decodeValue(data: number[], offset: number): { value: unknown; offset: number } {
    if (offset >= data.length) {
      return { value: null, offset };
    }

    const byte = data[offset];

    if (byte <= 0x7f) {
      return { value: byte, offset: offset + 1 };
    }

    if (byte >= 0xe0) {
      return { value: byte - 256, offset: offset + 1 };
    }

    if (byte === 0xc0) {
      return { value: null, offset: offset + 1 };
    }

    if (byte === 0xc2) {
      return { value: false, offset: offset + 1 };
    }

    if (byte === 0xc3) {
      return { value: true, offset: offset + 1 };
    }

    if (byte === 0xcc) {
      const value = data[offset + 1];
      return { value, offset: offset + 2 };
    }

    if (byte === 0xcd) {
      const value = (data[offset + 1] << 8) | data[offset + 2];
      return { value, offset: offset + 3 };
    }

    if (byte === 0xcb) {
      const buffer = Buffer.from(data.slice(offset + 1, offset + 9));
      const value = buffer.readDoubleBE();
      return { value, offset: offset + 9 };
    }

    if (byte >= 0xa0 && byte <= 0xbf) {
      const length = byte & 0x1f;
      const bytes = data.slice(offset + 1, offset + 1 + length);
      const value = Buffer.from(bytes).toString('utf8');
      return { value, offset: offset + 1 + length };
    }

    if (byte === 0xd9) {
      const length = data[offset + 1];
      const bytes = data.slice(offset + 2, offset + 2 + length);
      const value = Buffer.from(bytes).toString('utf8');
      return { value, offset: offset + 2 + length };
    }

    if (byte >= 0x90 && byte <= 0x9f) {
      return this._decodeArray(data, offset, byte & 0x0f);
    }

    if (byte === 0xdc) {
      const length = (data[offset + 1] << 8) | data[offset + 2];
      return this._decodeArray(data, offset, length);
    }

    if (byte >= 0x80 && byte <= 0x8f) {
      return this._decodeObject(data, offset, byte & 0x0f);
    }

    if (byte === 0xde) {
      const length = (data[offset + 1] << 8) | data[offset + 2];
      return this._decodeObject(data, offset, length);
    }

    return { value: null, offset: offset + 1 };
  }

  /**
   * Decodes an array
   * 
   * @param data - Byte array
   * @param offset - Current offset
   * @param length - Array length
   * @returns Decoded array and new offset
   */
  private _decodeArray(data: number[], offset: number, length: number): { value: unknown[]; offset: number } {
    const arr: unknown[] = [];
    let currentOffset = offset + 2;

    for (let i = 0; i < length; i++) {
      const result = this._decodeValue(data, currentOffset);
      arr.push(result.value);
      currentOffset = result.offset;
    }

    return { value: arr, offset: currentOffset };
  }

  /**
   * Decodes an object
   * 
   * @param data - Byte array
   * @param offset - Current offset
   * @param length - Object length
   * @returns Decoded object and new offset
   */
  private _decodeObject(data: number[], offset: number, length: number): { value: Record<string, unknown>; offset: number } {
    const obj: Record<string, unknown> = {};
    let currentOffset = offset + 2;

    for (let i = 0; i < length; i++) {
      const keyResult = this._decodeValue(data, currentOffset);
      const key = String(keyResult.value);
      currentOffset = keyResult.offset;

      const valueResult = this._decodeValue(data, currentOffset);
      obj[key] = valueResult.value;
      currentOffset = valueResult.offset;
    }

    return { value: obj, offset: currentOffset };
  }
}
