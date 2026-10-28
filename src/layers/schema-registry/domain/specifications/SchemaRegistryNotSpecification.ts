/**
 * SchemaRegistryNotSpecification
 */

import { ISchemaRegistrySpecification } from './ISchemaRegistrySpecification';
import { SchemaRegistryAndSpecification } from './SchemaRegistryAndSpecification';
import { SchemaRegistryOrSpecification } from './SchemaRegistryOrSpecification';

export class SchemaRegistryNotSpecification implements ISchemaRegistrySpecification {
  private _spec: ISchemaRegistrySpecification;

  constructor(spec: ISchemaRegistrySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification {
    return new SchemaRegistryAndSpecification([this, other]);
  }

  or(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification {
    return new SchemaRegistryOrSpecification([this, other]);
  }

  not(): ISchemaRegistrySpecification {
    return this._spec;
  }

  getInner(): ISchemaRegistrySpecification {
    return this._spec;
  }
}
