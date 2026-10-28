/**
 * SecretsRotationOrSpecification
 */

import { ISecretsRotationSpecification } from './ISecretsRotationSpecification';
import { SecretsRotationAndSpecification } from './SecretsRotationAndSpecification';
import { SecretsRotationNotSpecification } from './SecretsRotationNotSpecification';

export class SecretsRotationOrSpecification implements ISecretsRotationSpecification {
  private _specs: ISecretsRotationSpecification[];

  constructor(specs: ISecretsRotationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISecretsRotationSpecification): ISecretsRotationSpecification {
    return new SecretsRotationAndSpecification([this, other]);
  }

  or(other: ISecretsRotationSpecification): ISecretsRotationSpecification {
    return new SecretsRotationOrSpecification([...this._specs, other]);
  }

  not(): ISecretsRotationSpecification {
    return new SecretsRotationNotSpecification(this);
  }

  getSpecifications(): ISecretsRotationSpecification[] {
    return [...this._specs];
  }
}
