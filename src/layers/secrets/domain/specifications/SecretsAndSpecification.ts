/**
 * SecretsAndSpecification
 */

import { ISecretsSpecification } from './ISecretsSpecification';
import { SecretsOrSpecification } from './SecretsOrSpecification';
import { SecretsNotSpecification } from './SecretsNotSpecification';

export class SecretsAndSpecification implements ISecretsSpecification {
  private _specs: ISecretsSpecification[];

  constructor(specs: ISecretsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISecretsSpecification): ISecretsSpecification {
    return new SecretsAndSpecification([...this._specs, other]);
  }

  or(other: ISecretsSpecification): ISecretsSpecification {
    return new SecretsOrSpecification([this, other]);
  }

  not(): ISecretsSpecification {
    return new SecretsNotSpecification(this);
  }

  getSpecifications(): ISecretsSpecification[] {
    return [...this._specs];
  }
}
