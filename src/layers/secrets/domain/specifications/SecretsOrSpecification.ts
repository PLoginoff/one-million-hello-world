/**
 * SecretsOrSpecification
 */

import { ISecretsSpecification } from './ISecretsSpecification';
import { SecretsAndSpecification } from './SecretsAndSpecification';
import { SecretsNotSpecification } from './SecretsNotSpecification';

export class SecretsOrSpecification implements ISecretsSpecification {
  private _specs: ISecretsSpecification[];

  constructor(specs: ISecretsSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISecretsSpecification): ISecretsSpecification {
    return new SecretsAndSpecification([this, other]);
  }

  or(other: ISecretsSpecification): ISecretsSpecification {
    return new SecretsOrSpecification([...this._specs, other]);
  }

  not(): ISecretsSpecification {
    return new SecretsNotSpecification(this);
  }

  getSpecifications(): ISecretsSpecification[] {
    return [...this._specs];
  }
}
