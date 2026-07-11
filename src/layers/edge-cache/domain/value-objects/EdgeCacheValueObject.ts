/**
 * EdgeCache Value Object
 *
 * Immutable value object for the Edge caching and CDN abstraction layer.
 */

export class EdgeCacheValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('EdgeCache value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): EdgeCacheValueObject {
    return new EdgeCacheValueObject(value);
  }

  equals(other: EdgeCacheValueObject): boolean {
    return other instanceof EdgeCacheValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
