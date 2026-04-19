/**
 * Object Utilities
 * 
 * Utility functions for object manipulation.
 */

export class ObjectUtils {
  /**
   * Deep clones an object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as T;
    }
    if (obj instanceof Object) {
      const clonedObj = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
    return obj;
  }

  /**
   * Deep merges objects
   */
  static deepMerge<T extends Record<string, unknown>>(target: T, ...sources: Partial<T>[]): T {
    const result = this.deepClone(target);
    for (const source of sources) {
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          const sourceValue = source[key];
          const targetValue = result[key];

          if (this.isObject(sourceValue) && this.isObject(targetValue)) {
            result[key] = this.deepMerge(
              targetValue as Record<string, unknown>,
              sourceValue as Record<string, unknown>
            );
          } else {
            result[key] = this.deepClone(sourceValue);
          }
        }
      }
    }
    return result;
  }

  /**
   * Shallow merges objects
   */
  static merge<T extends Record<string, unknown>>(target: T, ...sources: Partial<T>[]): T {
    return Object.assign({}, target, ...sources);
  }

  /**
   * Gets value from object by path
   */
  static get(obj: Record<string, unknown>, path: string, defaultValue?: unknown): unknown {
    const keys = path.split('.');
    let result: unknown = obj;

    for (const key of keys) {
      if (result === null || result === undefined) {
        return defaultValue;
      }
      result = (result as Record<string, unknown>)[key];
    }

    return result === undefined ? defaultValue : result;
  }

  /**
   * Sets value in object by path
   */
  static set(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Deletes value from object by path
   */
  static delete(obj: Record<string, unknown>, path: string): boolean {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        return false;
      }
      current = current[key] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey in current) {
      delete current[lastKey];
      return true;
    }

    return false;
  }

  /**
   * Checks if object is empty
   */
  static isEmpty(obj: Record<string, unknown>): boolean {
    return Object.keys(obj).length === 0;
  }

  /**
   * Checks if object is not empty
   */
  static isNotEmpty(obj: Record<string, unknown>): boolean {
    return !this.isEmpty(obj);
  }

  /**
   * Gets all keys of object
   */
  static keys<T extends Record<string, unknown>>(obj: T): (keyof T)[] {
    return Object.keys(obj) as (keyof T)[];
  }

  /**
   * Gets all values of object
   */
  static values<T extends Record<string, unknown>>(obj: T): T[keyof T][] {
    return Object.values(obj);
  }

  /**
   * Gets all entries of object
   */
  static entries<T extends Record<string, unknown>>(obj: T): [keyof T, T[keyof T]][] {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
  }

  /**
   * Picks specific keys from object
   */
  static pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }
    return result;
  }

  /**
   * Omits specific keys from object
   */
  static omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const result = { ...obj };
    for (const key of keys) {
      delete result[key];
    }
    return result as Omit<T, K>;
  }

  /**
   * Checks if value is a plain object
   */
  static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Freezes object recursively
   */
  static deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    Object.freeze(obj);

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
          this.deepFreeze(value);
        }
      }
    }

    return obj;
  }

  /**
   * Creates object from array of key-value pairs
   */
  static fromEntries<T extends [string, unknown]>(entries: T[]): Record<string, unknown> {
    return Object.fromEntries(entries);
  }

  /**
   * Transforms object keys
   */
  static mapKeys<T extends Record<string, unknown>, K extends string>(
    obj: T,
    mapper: (key: keyof T) => K
  ): Record<K, T[keyof T]> {
    const result = {} as Record<K, T[keyof T]>;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[mapper(key)] = obj[key];
      }
    }
    return result;
  }

  /**
   * Transforms object values
   */
  static mapValues<T extends Record<string, unknown>, V>(
    obj: T,
    mapper: (value: T[keyof T], key: keyof T) => V
  ): Record<keyof T, V> {
    const result = {} as Record<keyof T, V>;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = mapper(obj[key], key);
      }
    }
    return result;
  }

  /**
   * Filters object by predicate
   */
  static filter<T extends Record<string, unknown>>(
    obj: T,
    predicate: (value: T[keyof T], key: keyof T) => boolean
  ): Partial<T> {
    const result = {} as Partial<T>;
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && predicate(obj[key], key)) {
        result[key] = obj[key];
      }
    }
    return result;
  }
}
