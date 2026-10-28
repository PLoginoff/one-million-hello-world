/**
 * OnboardingAndSpecification
 */

import { IOnboardingSpecification } from './IOnboardingSpecification';
import { OnboardingOrSpecification } from './OnboardingOrSpecification';
import { OnboardingNotSpecification } from './OnboardingNotSpecification';

export class OnboardingAndSpecification implements IOnboardingSpecification {
  private _specs: IOnboardingSpecification[];

  constructor(specs: IOnboardingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IOnboardingSpecification): IOnboardingSpecification {
    return new OnboardingAndSpecification([...this._specs, other]);
  }

  or(other: IOnboardingSpecification): IOnboardingSpecification {
    return new OnboardingOrSpecification([this, other]);
  }

  not(): IOnboardingSpecification {
    return new OnboardingNotSpecification(this);
  }

  getSpecifications(): IOnboardingSpecification[] {
    return [...this._specs];
  }
}
