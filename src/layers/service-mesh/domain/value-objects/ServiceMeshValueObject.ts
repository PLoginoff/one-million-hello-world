/**
 * ServiceMesh Value Object
 *
 * Immutable value object for the Service mesh abstraction and sidecar pattern layer.
 */

export class ServiceMeshValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('ServiceMesh value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ServiceMeshValueObject {
    return new ServiceMeshValueObject(value);
  }

  equals(other: ServiceMeshValueObject): boolean {
    return other instanceof ServiceMeshValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
