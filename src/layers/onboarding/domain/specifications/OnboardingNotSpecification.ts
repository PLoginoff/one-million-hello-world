/**
 * OnboardingNotSpecification
 */

import { IOnboardingSpecification } from './IOnboardingSpecification';
import { OnboardingAndSpecification } from './OnboardingAndSpecification';
import { OnboardingOrSpecification } from './OnboardingOrSpecification';

export class OnboardingNotSpecification implements IOnboardingSpecification {
  private _spec: IOnboardingSpecification;

  constructor(spec: IOnboardingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IOnboardingSpecification): IOnboardingSpecification {
    return new OnboardingAndSpecification([this, other]);
  }

  or(other: IOnboardingSpecification): IOnboardingSpecification {
    return new OnboardingOrSpecification([this, other]);
  }

  not(): IOnboardingSpecification {
    return this._spec;
  }

  getInner(): IOnboardingSpecification {
    return this._spec;
  }
}
