/**
 * SecretsRotationAndSpecification
 */

import { ISecretsRotationSpecification } from './ISecretsRotationSpecification';
import { SecretsRotationOrSpecification } from './SecretsRotationOrSpecification';
import { SecretsRotationNotSpecification } from './SecretsRotationNotSpecification';

export class SecretsRotationAndSpecification implements ISecretsRotationSpecification {
  private _specs: ISecretsRotationSpecification[];

  constructor(specs: ISecretsRotationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ISecretsRotationSpecification): ISecretsRotationSpecification {
    return new SecretsRotationAndSpecification([...this._specs, other]);
  }

  or(other: ISecretsRotationSpecification): ISecretsRotationSpecification {
    return new SecretsRotationOrSpecification([this, other]);
  }

  not(): ISecretsRotationSpecification {
    return new SecretsRotationNotSpecification(this);
  }

  getSpecifications(): ISecretsRotationSpecification[] {
    return [...this._specs];
  }
}
