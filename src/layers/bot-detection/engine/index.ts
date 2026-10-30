/**
 * Bot-Detection Engine — public exports.
 *
 * @module BotDetectionLayer/Engine
 */

export * from './types';
export { BiometricAnalyzer } from './BiometricAnalyzer';
export { FingerprintRegistry } from './FingerprintRegistry';
export type { FingerprintOptions } from './FingerprintRegistry';
export { EscalationPolicy } from './EscalationPolicy';
export { BotnetDetector } from './BotnetDetector';
export type { BotnetOptions } from './BotnetDetector';
