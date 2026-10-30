/**
 * Onboarding Engine2 — public exports.
 *
 * Second-generation engine modules built ON TOP of `flow/`:
 *   - PercentileTracker      — streaming step/TTC percentiles
 *   - ExperimentAnalyzer     — A/B completion significance (z-test)
 *   - RolePersonalizer       — role-driven flow filtering + re-linking
 *   - ReengagementCampaigns  — targeted stuck-at-step outreach
 *   - FunnelAnalytics        — canonical-order funnel reports + cohorts
 *
 * @module OnboardingLayer/Engine2
 */

export { PercentileTracker, ReservoirSampler } from './PercentileTracker';
export type { QuantileReport, PercentileTrackerOptions } from './PercentileTracker';

export {
  compareCompletionRates,
  compareStepFunnels,
  assignExperimentVariant,
  hashToUnitInterval,
  normalCdf,
} from './ExperimentAnalyzer';
export type {
  VariantArm,
  SignificanceResult,
  StepConversion,
  ExperimentVariantSpec,
} from './ExperimentAnalyzer';

export { RolePersonalizer } from './RolePersonalizer';
export type { RoleProfile, PersonalizeResult } from './RolePersonalizer';

export { ReengagementCampaigns } from './ReengagementCampaign';
export type {
  Campaign,
  CampaignTouch,
  CampaignStats,
  ReengagementOptions,
} from './ReengagementCampaign';

export { FunnelAnalytics } from './OnboardingAnalytics';
export type { RunSnapshot, StepConversionRow, FunnelReport } from './OnboardingAnalytics';

export { AbandonmentPredictor } from './AbandonmentPredictor';
export type { TimedRun, RiskScore, PredictorWeights } from './AbandonmentPredictor';
