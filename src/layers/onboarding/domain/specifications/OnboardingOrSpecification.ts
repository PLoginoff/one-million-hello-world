/**
 * OnboardingOrSpecification
 */

import { IOnboardingSpecification } from './IOnboardingSpecification';
import { OnboardingAndSpecification } from './OnboardingAndSpecification';
import { OnboardingNotSpecification } from './OnboardingNotSpecification';

export class OnboardingOrSpecification implements IOnboardingSpecification {
  private _specs: IOnboardingSpecification[];

  constructor(specs: IOnboardingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IOnboardingSpecification): IOnboardingSpecification {
    return new OnboardingAndSpecification([this, other]);
  }

  or(other: IOnboardingSpecification): IOnboardingSpecification {
    return new OnboardingOrSpecification([...this._specs, other]);
  }

  not(): IOnboardingSpecification {
    return new OnboardingNotSpecification(this);
  }

  getSpecifications(): IOnboardingSpecification[] {
    return [...this._specs];
  }
}
