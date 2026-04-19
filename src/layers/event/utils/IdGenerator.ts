/**
 * IdGenerator - Utility
 * 
 * Generates unique identifiers for events and subscriptions.
 * Supports multiple ID generation strategies.
 */

export type IdGenerationStrategy = 'uuid' | 'nanoid' | 'ulid' | 'custom';

export interface IdGeneratorOptions {
  strategy: IdGenerationStrategy;
  prefix?: string;
  suffix?: string;
  length?: number;
}

export class IdGenerator {
  private _options: IdGeneratorOptions;
  private _counter: number;

  constructor(options: IdGeneratorOptions = { strategy: 'uuid' }) {
    this._options = options;
    this._counter = 0;
  }

  generate(): string {
    const prefix = this._options.prefix || '';
    const suffix = this._options.suffix || '';
    const id = this._generateByStrategy();

    return `${prefix}${id}${suffix}`;
  }

  generateBatch(count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(this.generate());
    }
    return ids;
  }

  setOptions(options: Partial<IdGeneratorOptions>): void {
    this._options = { ...this._options, ...options };
  }

  getOptions(): IdGeneratorOptions {
    return { ...this._options };
  }

  private _generateByStrategy(): string {
    switch (this._options.strategy) {
      case 'uuid':
        return this._generateUUID();
      case 'nanoid':
        return this._generateNanoId();
      case 'ulid':
        return this._generateULID();
      case 'custom':
        return this._generateCustom();
      default:
        return this._generateUUID();
    }
  }

  private _generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private _generateNanoId(): string {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const length = this._options.length || 21;
    let id = '';
    
    for (let i = 0; i < length; i++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    
    return id;
  }

  private _generateULID(): string {
    const timestamp = Date.now().toString(16).padStart(12, '0');
    const random = this._generateRandomString(10);
    return `${timestamp}${random}`;
  }

  private _generateCustom(): string {
    this._counter++;
    const timestamp = Date.now().toString(36);
    const counter = this._counter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${counter}_${random}`;
  }

  private _generateRandomString(length: number): string {
    const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }
}
