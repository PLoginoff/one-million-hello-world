/**
 * Rate Limiting Layer Types
 * 
 * This module defines all type definitions for the Rate Limiting Layer,
 * including rate limit strategies, buckets, and configurations.
 */

/**
 * Rate limit error codes
 */
export enum RateLimitErrorCode {
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  INVALID_IDENTIFIER = 'INVALID_IDENTIFIER',
  INVALID_CONFIG = 'INVALID_CONFIG',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  TIER_EXCEEDED = 'TIER_EXCEEDED',
  RULE_VIOLATION = 'RULE_VIOLATION',
  BUCKET_NOT_FOUND = 'BUCKET_NOT_FOUND',
  STRATEGY_NOT_SUPPORTED = 'STRATEGY_NOT_SUPPORTED',
}

/**
 * Rate limit event types
 */
export enum RateLimitEventType {
  REQUEST_ALLOWED = 'REQUEST_ALLOWED',
  REQUEST_DENIED = 'REQUEST_DENIED',
  BUCKET_CREATED = 'BUCKET_CREATED',
  BUCKET_RESET = 'BUCKET_RESET',
  BUCKET_EXPIRED = 'BUCKET_EXPIRED',
  QUOTA_REACHED = 'QUOTA_REACHED',
  TIER_UPGRADED = 'TIER_UPGRADED',
  TIER_DOWNGRADED = 'TIER_DOWNGRADED',
  RULE_ADDED = 'RULE_ADDED',
  RULE_REMOVED = 'RULE_REMOVED',
}

/**
 * Rate limit scope
 */
export enum RateLimitScope {
  GLOBAL = 'GLOBAL',
  PER_USER = 'PER_USER',
  PER_API_KEY = 'PER_API_KEY',
  PER_IP = 'PER_IP',
  PER_ENDPOINT = 'PER_ENDPOINT',
  CUSTOM = 'CUSTOM',
}

/**
 * Rate limit action
 */
export enum RateLimitAction {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  THROTTLE = 'THROTTLE',
  QUEUE = 'QUEUE',
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerWindow: number;
  windowSizeMs: number;
  burstSize: number;
  strategy: RateLimitStrategy;
  enabled: boolean;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  enableBurstProtection: boolean;
  enableGracePeriod: boolean;
  gracePeriodMs: number;
  enablePriorityQueuing: boolean;
  maxQueueSize: number;
}

/**
 * Rate limit strategies
 */
export enum RateLimitStrategy {
  TOKEN_BUCKET = 'TOKEN_BUCKET',
  SLIDING_WINDOW = 'SLIDING_WINDOW',
  FIXED_WINDOW = 'FIXED_WINDOW',
  LEAKY_BUCKET = 'LEAKY_BUCKET',
}

/**
 * Rate limit identifier types
 */
export enum RateLimitIdentifierType {
  IP_ADDRESS = 'IP_ADDRESS',
  USER_ID = 'USER_ID',
  API_KEY = 'API_KEY',
  CUSTOM = 'CUSTOM',
}

/**
 * Rate limit identifier
 */
export interface RateLimitIdentifier {
  type: RateLimitIdentifierType;
  value: string;
}

/**
 * Token bucket state
 */
export interface TokenBucketState {
  tokens: number;
  lastRefill: Date;
}

/**
 * Sliding window state
 */
export interface SlidingWindowState {
  timestamps: Date[];
}

/**
 * Fixed window state
 */
export interface FixedWindowState {
  count: number;
  windowStart: Date;
}

/**
 * Rate limit statistics
 */
export interface RateLimitStats {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  currentBuckets: number;
  totalBucketsCreated: number;
  totalBucketsExpired: number;
  averageRequestRate: number;
  peakRequestRate: number;
  lastResetTime: Date;
  deniedRequestsByReason: Map<RateLimitErrorCode, number>;
  requestsByScope: Map<RateLimitScope, number>;
  requestsByStrategy: Map<RateLimitStrategy, number>;
}

/**
 * Extended rate limit result
 */
export interface ExtendedRateLimitResult extends RateLimitResult {
  metrics: RateLimitMetrics;
  warnings?: RateLimitWarning[];
  action: RateLimitAction;
  quota?: RateLimitQuota;
  tier?: RateLimitTier;
}

/**
 * Rate limit metrics
 */
export interface RateLimitMetrics {
  checkStartTime: number;
  checkEndTime: number;
  checkDuration: number;
  bucketLookupTime: number;
  strategyExecutionTime: number;
  totalTime: number;
}

/**
 * Rate limit health status
 */
export interface RateLimitHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: RateLimitHealthCheck[];
  lastCheck: Date;
}

/**
 * Rate limit health check
 */
export interface RateLimitHealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  duration: number;
}

/**
 * Rate limit diagnostics
 */
export interface RateLimitDiagnostics {
  traceId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  steps: DiagnosticStep[];
  summary: DiagnosticSummary;
}

/**
 * Diagnostic step
 */
export interface DiagnosticStep {
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'success' | 'failure' | 'skipped';
  details: any;
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  overallStatus: 'success' | 'partial' | 'failure';
}

/**
 * Rate limit warning
 */
export interface RateLimitWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
}

/**
 * Rate limit bucket info
 */
export interface RateLimitBucketInfo {
  identifier: RateLimitIdentifier;
  strategy: RateLimitStrategy;
  state: TokenBucketState | SlidingWindowState | FixedWindowState | LeakyBucketState;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  quota?: RateLimitQuota;
}

/**
 * Rate limit pattern
 */
export interface RateLimitPattern {
  name: string;
  pattern: string;
  scope: RateLimitScope;
  action: RateLimitAction;
  enabled: boolean;
}

/**
 * Rate limit tier
 */
export interface RateLimitTier {
  name: string;
  requestsPerWindow: number;
  windowSizeMs: number;
  burstSize: number;
  priority: number;
  features: string[];
}

/**
 * Rate limit quota
 */
export interface RateLimitQuota {
  limit: number;
  used: number;
  remaining: number;
  resetTime: Date;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Rate limit usage
 */
export interface RateLimitUsage {
  identifier: RateLimitIdentifier;
  scope: RateLimitScope;
  requests: number;
  allowed: number;
  denied: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Leaky bucket state
 */
export interface LeakyBucketState {
  tokens: number;
  lastLeak: Date;
  queueSize: number;
}

/**
 * Sliding window log
 */
export interface SlidingWindowLog {
  timestamps: Date[];
  maxLogSize: number;
}

/**
 * Rate limit rule
 */
export interface RateLimitRule {
  id: string;
  name: string;
  scope: RateLimitScope;
  pattern?: string;
  config: RateLimitConfig;
  action: RateLimitAction;
  enabled: boolean;
  priority: number;
}

/**
 * Rate limit exception
 */
export interface RateLimitException {
  id: string;
  identifier: RateLimitIdentifier;
  reason: string;
  expiresAt?: Date;
  permanent: boolean;
}
