/**
 * Onboarding Interface
 *
 * Defines the contract for the User onboarding flows and step tracking layer.
 */

import { OnboardingResult, OnboardingContext } from '../types/onboarding-types';

export interface IOnboarding {
  execute(context: OnboardingContext): Promise<OnboardingResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
