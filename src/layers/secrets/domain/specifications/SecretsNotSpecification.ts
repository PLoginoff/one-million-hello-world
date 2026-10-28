/**
 * SecretsNotSpecification
 */

import { ISecretsSpecification } from './ISecretsSpecification';
import { SecretsAndSpecification } from './SecretsAndSpecification';
import { SecretsOrSpecification } from './SecretsOrSpecification';

export class SecretsNotSpecification implements ISecretsSpecification {
  private _spec: ISecretsSpecification;

  constructor(spec: ISecretsSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISecretsSpecification): ISecretsSpecification {
    return new SecretsAndSpecification([this, other]);
  }

  or(other: ISecretsSpecification): ISecretsSpecification {
    return new SecretsOrSpecification([this, other]);
  }

  not(): ISecretsSpecification {
    return this._spec;
  }

  getInner(): ISecretsSpecification {
    return this._spec;
  }
}
