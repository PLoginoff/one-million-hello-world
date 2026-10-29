export { BotDetectionDefaultStrategy } from './DefaultStrategy';
export { BotDetectionFastStrategy } from './FastStrategy';
export { BotDetectionReliableStrategy } from './ReliableStrategy';
export { BotDetectionCachedStrategy } from './CachedStrategy';
export { BotDetectionBatchStrategy } from './BatchStrategy';

// Real detection signals
export { UserAgentSignal, KNOWN_BOTS, SUSPICIOUS_UA_PATTERNS } from './UserAgentSignal';
export { RequestFrequencySignal } from './RequestFrequencySignal';
export type { FrequencyConfig } from './RequestFrequencySignal';
export { TimingEntropySignal, stats } from './TimingEntropySignal';
export type { TimingConfig } from './TimingEntropySignal';
export { HeaderConsistencySignal } from './HeaderConsistencySignal';
export { HoneypotSignal } from './HoneypotSignal';
export type { HoneypotConfig } from './HoneypotSignal';
export { BotScoreAggregator } from './BotScoreAggregator';
export type { AggregatorConfig } from './BotScoreAggregator';
