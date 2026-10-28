/**
 * SchemaRegistryOrSpecification
 */

import { ISchemaRegistrySpecification } from './ISchemaRegistrySpecification';
import { SchemaRegistryAndSpecification } from './SchemaRegistryAndSpecification';
import { SchemaRegistryNotSpecification } from './SchemaRegistryNotSpecification';

export class SchemaRegistryOrSpecification implements ISchemaRegistrySpecification {
  private _specs: ISchemaRegistrySpecification[];

  constructor(specs: ISchemaRegistrySpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification {
    return new SchemaRegistryAndSpecification([this, other]);
  }

  or(other: ISchemaRegistrySpecification): ISchemaRegistrySpecification {
    return new SchemaRegistryOrSpecification([...this._specs, other]);
  }

  not(): ISchemaRegistrySpecification {
    return new SchemaRegistryNotSpecification(this);
  }

  getSpecifications(): ISchemaRegistrySpecification[] {
    return [...this._specs];
  }
}
