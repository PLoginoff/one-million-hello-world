/**
 * SchemaRegistryAndSpecification
 */

import { ISchemaRegistrySpecification } from './ISchemaRegistrySpecification';
import { SchemaRegistryOrSpecification } from './SchemaRegistryOrSpecification';
import { SchemaRegistryNotSpecification } from './SchemaRegistryNotSpecification';

export class SchemaRegistryAndSpecification implements ISchemaRegistrySpecification {
  private _specs: ISchemaRegistrySpecification[];

  constructor(specs: ISchemaRegistrySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification {
    return new SchemaRegistryAndSpecification([...this._specs, other]);
  }

  or(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification {
    return new SchemaRegistryOrSpecification([this, other]);
  }

  not(): ISchemaRegistrySpecification {
    return new SchemaRegistryNotSpecification(this);
  }

  getSpecifications(): ISchemaRegistrySpecification[] {
    return [...this._specs];
  }
}
