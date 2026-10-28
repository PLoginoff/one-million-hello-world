/**
 * SecretsRotationNotSpecification
 */

import { ISecretsRotationSpecification } from './ISecretsRotationSpecification';
import { SecretsRotationAndSpecification } from './SecretsRotationAndSpecification';
import { SecretsRotationOrSpecification } from './SecretsRotationOrSpecification';

export class SecretsRotationNotSpecification implements ISecretsRotationSpecification {
  private _spec: ISecretsRotationSpecification;

  constructor(spec: ISecretsRotationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISecretsRotationSpecification): ISecretsRotationSpecification {
    return new SecretsRotationAndSpecification([this, other]);
  }

  or(other: ISecretsRotationSpecification): ISecretsRotationSpecification {
    return new SecretsRotationOrSpecification([this, other]);
  }

  not(): ISecretsRotationSpecification {
    return this._spec;
  }

  getInner(): ISecretsRotationSpecification {
    return this._spec;
  }
}
