/**
 * Type Guards
 * 
 * Runtime type checking utilities for serialization data.
 */

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise || (isObject(value) && 'then' in value && 'catch' in value);
}

export function isSerializable(value: unknown): boolean {
  if (isNull(value) || isUndefined(value)) {
    return true;
  }

  if (isString(value) || isNumber(value) || isBoolean(value)) {
    return true;
  }

  if (isArray(value)) {
    return value.every(isSerializable);
  }

  if (isObject(value)) {
    return Object.values(value).every(isSerializable);
  }

  return false;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function isEmpty(value: unknown): boolean {
  if (isNullOrUndefined(value)) {
    return true;
  }

  if (isString(value) || isArray(value)) {
    return value.length === 0;
  }

  if (isObject(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
}

export function isNotEmpty(value: unknown): boolean {
  return !isEmpty(value);
}

export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

export function isFloat(value: unknown): value is number {
  return isNumber(value) && !isInteger(value);
}

export function isPositive(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

export function isNegative(value: unknown): value is number {
  return isNumber(value) && value < 0;
}

export function isNonNegative(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

export function isEmail(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

export function isURL(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function isUUID(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export function isJSON(value: unknown): boolean {
  if (!isString(value)) {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

export function hasMethod<K extends string>(obj: unknown, key: K): obj is Record<K, (...args: unknown[]) => unknown> {
  return hasProperty(obj, key) && isFunction(obj[key]);
}
