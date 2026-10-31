/**
 * Fraud-Detection Engine — public exports.
 *
 * @module FraudDetectionLayer/Engine
 */

export * from './types';
export { VelocityTracker } from './VelocityTracker';
export { FraudGraph } from './FraudGraph';
export { CaseManager, CaseError } from './CaseManager';
export { ModelRegistry } from './ModelRegistry';
export type { ModelRegistryOptions } from './ModelRegistry';
export { DeviceIntelligence } from './DeviceIntelligence';
export { SessionAnalyzer } from './SessionAnalyzer';
export { CrossChannelLinker } from './CrossChannelLinker';
export { AdaptiveThresholds } from './AdaptiveThresholds';
