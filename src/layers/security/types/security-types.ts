/**
 * Security Layer Types
 * 
 * This module defines all type definitions for the Security Layer,
 * including authentication, authorization, CORS, threat detection,
 * rate limiting, IP filtering, and security monitoring.
 */

/**
 * Security context containing authentication and authorization information
 */
export interface SecurityContext {
  isAuthenticated: boolean;
  userId?: string;
  roles: string[];
  permissions: string[];
  ipAddress: string;
  userAgent: string;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Authentication credentials
 */
export interface AuthCredentials {
  token?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  context?: SecurityContext;
  error?: SecurityError;
}

/**
 * Security error details
 */
export interface SecurityError {
  code: SecurityErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Security error codes
 */
export enum SecurityErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  CORS_VIOLATION = 'CORS_VIOLATION',
  THREAT_DETECTED = 'THREAT_DETECTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  IP_BLOCKED = 'IP_BLOCKED',
  USER_AGENT_BLOCKED = 'USER_AGENT_BLOCKED',
  REQUEST_SIZE_EXCEEDED = 'REQUEST_SIZE_EXCEEDED',
  HEADER_SIZE_EXCEEDED = 'HEADER_SIZE_EXCEEDED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  TIMESTAMP_TOO_OLD = 'TIMESTAMP_TOO_OLD',
  TIMESTAMP_TOO_NEW = 'TIMESTAMP_TOO_NEW',
  NONCE_REUSE = 'NONCE_REUSE',
  MISSING_REQUIRED_HEADER = 'MISSING_REQUIRED_HEADER',
  INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',
}

/**
 * Threat detection result
 */
export interface ThreatDetectionResult {
  isThreat: boolean;
  threatType?: ThreatType;
  confidence: number;
  details?: string;
}

/**
 * Types of security threats
 */
export enum ThreatType {
  SQL_INJECTION = 'SQL_INJECTION',
  XSS = 'XSS',
  CSRF = 'CSRF',
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  DDOS = 'DDOS',
  MALICIOUS_USER_AGENT = 'MALICIOUS_USER_AGENT',
  COMMAND_INJECTION = 'COMMAND_INJECTION',
  LDAP_INJECTION = 'LDAP_INJECTION',
  XML_INJECTION = 'XML_INJECTION',
  SSRF = 'SSRF',
  XXE = 'XXE',
  HEADER_INJECTION = 'HEADER_INJECTION',
  PROTOCOL_VIOLATION = 'PROTOCOL_VIOLATION',
}

/**
 * Security policy configuration
 */
export interface SecurityPolicyConfig {
  requireAuth: boolean;
  allowedRoles: string[];
  corsEnabled: boolean;
  corsConfig: CorsConfig;
  threatDetectionEnabled: boolean;
  maxRequestSize: number;
  maxHeaderSize: number;
  enableRateLimiting: boolean;
  rateLimitConfig: RateLimitConfig;
  enableIPFiltering: boolean;
  ipFilterConfig: IPFilterConfig;
  enableUserAgentFiltering: boolean;
  userAgentFilterConfig: UserAgentFilterConfig;
  enableSignatureValidation: boolean;
  signatureConfig: SignatureConfig;
  enableTimestampValidation: boolean;
  timestampConfig: TimestampConfig;
  enableNonceValidation: boolean;
  nonceConfig: NonceConfig;
  requiredHeaders: string[];
  allowedContentTypes: string[];
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  enableBurstProtection: boolean;
  burstLimit: number;
}

/**
 * IP filtering configuration
 */
export interface IPFilterConfig {
  whitelist: string[];
  blacklist: string[];
  allowPrivateIPs: boolean;
  blockTorExitNodes: boolean;
  blockVPNs: boolean;
}

/**
 * User agent filtering configuration
 */
export interface UserAgentFilterConfig {
  blockedPatterns: string[];
  allowedPatterns: string[];
  requireUserAgent: boolean;
}

/**
 * Signature validation configuration
 */
export interface SignatureConfig {
  algorithm: 'HMAC-SHA256' | 'HMAC-SHA512' | 'RSA-SHA256';
  secretKey: string;
  headerName: string;
}

/**
 * Timestamp validation configuration
 */
export interface TimestampConfig {
  maxAge: number;
  clockSkewTolerance: number;
  headerName: string;
}

/**
 * Nonce validation configuration
 */
export interface NonceConfig {
  maxAge: number;
  headerName: string;
}

/**
 * Security statistics
 */
export interface SecurityStats {
  totalAuthAttempts: number;
  successfulAuthAttempts: number;
  failedAuthAttempts: number;
  totalThreatsDetected: number;
  threatsByType: Map<ThreatType, number>;
  totalCorsViolations: number;
  totalRateLimitViolations: number;
  totalIPBlocks: number;
  averageAuthTime: number;
  lastAuthTime: number;
}

/**
 * Security health status
 */
export interface SecurityHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: SecurityHealthCheck[];
  lastCheck: Date;
}

/**
 * Security health check result
 */
export interface SecurityHealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
}

/**
 * Security audit log entry
 */
export interface SecurityAuditLog {
  timestamp: Date;
  event: SecurityEvent;
  ipAddress: string;
  userAgent: string;
  userId?: string;
  details: Record<string, unknown>;
}

/**
 * Security event types
 */
export enum SecurityEvent {
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  AUTHORIZATION_FAILURE = 'AUTHORIZATION_FAILURE',
  CORS_VIOLATION = 'CORS_VIOLATION',
  THREAT_DETECTED = 'THREAT_DETECTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  IP_BLOCKED = 'IP_BLOCKED',
  SIGNATURE_VALIDATION_FAILURE = 'SIGNATURE_VALIDATION_FAILURE',
  TIMESTAMP_VALIDATION_FAILURE = 'TIMESTAMP_VALIDATION_FAILURE',
  NONCE_REUSE = 'NONCE_REUSE',
}

/**
 * Token information
 */
export interface TokenInfo {
  userId: string;
  roles: string[];
  permissions: string[];
  issuedAt: Date;
  expiresAt: Date;
  issuer: string;
  audience: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

/**
 * IP address information
 */
export interface IPInfo {
  address: string;
  isPrivate: boolean;
  isTorExitNode: boolean;
  isVPN: boolean;
  country?: string;
  city?: string;
}

/**
 * Rate limit entry
 */
export interface RateLimitEntry {
  ipAddress: string;
  requestCount: number;
  windowStart: Date;
  burstCount: number;
  burstWindowStart: Date;
}

/**
 * Nonce entry
 */
export interface NonceEntry {
  value: string;
  usedAt: Date;
  expiresAt: Date;
  ipAddress: string;
}

/**
 * Security diagnostics information
 */
export interface SecurityDiagnostics {
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
  details: Record<string, unknown>;
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  overallStatus: 'success' | 'failure' | 'partial';
}

/**
 * Extended security context
 */
export interface ExtendedSecurityContext extends SecurityContext {
  tokenInfo?: TokenInfo;
  sessionInfo?: SessionInfo;
  ipInfo?: IPInfo;
  authMethod: AuthMethod;
  authTime: Date;
  metadata: Map<string, string>;
}

/**
 * Authentication methods
 */
export enum AuthMethod {
  BEARER_TOKEN = 'BEARER_TOKEN',
  API_KEY = 'API_KEY',
  BASIC_AUTH = 'BASIC_AUTH',
  JWT = 'JWT',
  OAUTH2 = 'OAUTH2',
  SESSION_COOKIE = 'SESSION_COOKIE',
  SIGNATURE = 'SIGNATURE',
  ANONYMOUS = 'ANONYMOUS',
}

/**
 * Security metrics
 */
export interface SecurityMetrics {
  authStartTime: number;
  authEndTime: number;
  authDuration: number;
  threatDetectionTime: number;
  corsValidationTime: number;
  authorizationTime: number;
  totalSecurityTime: number;
}

/**
 * Extended authentication result
 */
export interface ExtendedAuthResult extends AuthResult {
  metrics?: SecurityMetrics;
  warnings?: SecurityWarning[];
}

/**
 * Security warning
 */
export interface SecurityWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Extended threat detection result
 */
export interface ExtendedThreatDetectionResult extends ThreatDetectionResult {
  detectedPatterns: string[];
  riskScore: number;
  recommendations: string[];
}
