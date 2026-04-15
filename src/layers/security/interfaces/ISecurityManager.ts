/**
 * Security Manager Interface
 * 
 * Defines the contract for security operations including
 * authentication, authorization, CORS, and threat detection.
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  SecurityContext,
  AuthCredentials,
  AuthResult,
  SecurityPolicyConfig,
  ThreatDetectionResult,
  ExtendedSecurityContext,
  ExtendedAuthResult,
  ExtendedThreatDetectionResult,
  SecurityStats,
  SecurityHealthStatus,
  SecurityDiagnostics,
  SecurityAuditLog,
  SecurityEvent,
  RateLimitEntry,
  NonceEntry,
  IPInfo,
  AuthMethod,
  SecurityWarning,
  ThreatType,
} from '../types/security-types';

/**
 * Interface for managing security operations
 */
export interface ISecurityManager {
  /**
   * Authenticates a request based on credentials
   * 
   * @param request - HTTP request to authenticate
   * @param credentials - Authentication credentials
   * @returns Authentication result with security context
   */
  authenticate(request: HttpRequest, credentials?: AuthCredentials): AuthResult;

  /**
   * Authorizes a request based on security context and required permissions
   * 
   * @param context - Security context from authentication
   * @param requiredPermissions - Required permissions for access
   * @returns True if authorized, false otherwise
   */
  authorize(context: SecurityContext, requiredPermissions: string[]): boolean;

  /**
   * Validates CORS headers for a request
   * 
   * @param request - HTTP request to validate
   * @returns True if CORS is valid, false otherwise
   */
  validateCors(request: HttpRequest): boolean;

  /**
   * Detects security threats in a request
   * 
   * @param request - HTTP request to analyze
   * @returns Threat detection result
   */
  detectThreats(request: HttpRequest): ThreatDetectionResult;

  /**
   * Sets the security policy configuration
   * 
   * @param config - Security policy configuration
   */
  setSecurityPolicy(config: SecurityPolicyConfig): void;

  /**
   * Gets the current security policy configuration
   * 
   * @returns Current security policy configuration
   */
  getSecurityPolicy(): SecurityPolicyConfig;

  /**
   * Validates request size against policy limits
   * 
   * @param request - HTTP request to validate
   * @returns True if size is within limits, false otherwise
   */
  validateRequestSize(request: HttpRequest): boolean;

  /**
   * Extracts security context from request headers
   * 
   * @param request - HTTP request
   * @returns Security context or null if not authenticated
   */
  extractSecurityContext(request: HttpRequest): SecurityContext | null;

  /**
   * Authenticates with extended result including metrics
   * 
   * @param request - HTTP request to authenticate
   * @param credentials - Authentication credentials
   * @returns Extended authentication result
   */
  authenticateExtended(request: HttpRequest, credentials?: AuthCredentials): ExtendedAuthResult;

  /**
   * Detects threats with extended result
   * 
   * @param request - HTTP request to analyze
   * @returns Extended threat detection result
   */
  detectThreatsExtended(request: HttpRequest): ExtendedThreatDetectionResult;

  /**
   * Validates IP address against filtering rules
   * 
   * @param ipAddress - IP address to validate
   * @returns True if IP is allowed, false otherwise
   */
  validateIPAddress(ipAddress: string): boolean;

  /**
   * Validates user agent against filtering rules
   * 
   * @param userAgent - User agent string to validate
   * @returns True if user agent is allowed, false otherwise
   */
  validateUserAgent(userAgent: string): boolean;

  /**
   * Validates request signature
   * 
   * @param request - HTTP request to validate
   * @returns True if signature is valid, false otherwise
   */
  validateSignature(request: HttpRequest): boolean;

  /**
   * Validates request timestamp
   * 
   * @param request - HTTP request to validate
   * @returns True if timestamp is valid, false otherwise
   */
  validateTimestamp(request: HttpRequest): boolean;

  /**
   * Validates request nonce
   * 
   * @param request - HTTP request to validate
   * @returns True if nonce is valid, false otherwise
   */
  validateNonce(request: HttpRequest): boolean;

  /**
   * Checks rate limit for IP address
   * 
   * @param ipAddress - IP address to check
   * @returns True if under rate limit, false otherwise
   */
  checkRateLimit(ipAddress: string): boolean;

  /**
   * Gets security statistics
   * 
   * @returns Security statistics
   */
  getStats(): SecurityStats;

  /**
   * Resets security statistics
   */
  resetStats(): void;

  /**
   * Gets security health status
   * 
   * @returns Security health status
   */
  getHealthStatus(): SecurityHealthStatus;

  /**
   * Runs security diagnostics
   * 
   * @returns Security diagnostics information
   */
  runDiagnostics(): SecurityDiagnostics;

  /**
   * Logs security event
   * 
   * @param event - Security event to log
   * @param request - HTTP request
   * @param context - Security context
   */
  logSecurityEvent(event: SecurityEvent, request: HttpRequest, context?: SecurityContext): void;

  /**
   * Gets audit log entries
   * 
   * @param limit - Maximum number of entries to return
   * @returns Audit log entries
   */
  getAuditLog(limit?: number): SecurityAuditLog[];

  /**
   * Clears audit log
   */
  clearAuditLog(): void;

  /**
   * Adds security warning
   * 
   * @param warning - Security warning to add
   */
  addWarning(warning: SecurityWarning): void;

  /**
   * Clears all warnings
   */
  clearWarnings(): void;

  /**
   * Gets all warnings
   * 
   * @returns Array of security warnings
   */
  getWarnings(): SecurityWarning[];

  /**
   * Gets IP information
   * 
   * @param ipAddress - IP address to analyze
   * @returns IP information
   */
  getIPInfo(ipAddress: string): IPInfo;

  /**
   * Gets rate limit entry for IP
   * 
   * @param ipAddress - IP address
   * @returns Rate limit entry
   */
  getRateLimitEntry(ipAddress: string): RateLimitEntry | null;

  /**
   * Adds nonce entry
   * 
   * @param nonce - Nonce value
   * @param ipAddress - IP address
   */
  addNonce(nonce: string, ipAddress: string): void;

  /**
   * Checks if nonce is used
   * 
   * @param nonce - Nonce value
   * @returns True if nonce is used, false otherwise
   */
  isNonceUsed(nonce: string): boolean;

  /**
   * Cleans up expired nonces
   */
  cleanupExpiredNonces(): void;

  /**
   * Creates extended security context
   * 
   * @param request - HTTP request
   * @param userId - User ID
   * @param authMethod - Authentication method
   * @returns Extended security context
   */
  createExtendedContext(request: HttpRequest, userId: string, authMethod: AuthMethod): ExtendedSecurityContext;

  /**
   * Validates required headers
   * 
   * @param request - HTTP request
   * @returns True if all required headers present, false otherwise
   */
  validateRequiredHeaders(request: HttpRequest): boolean;

  /**
   * Validates content type
   * 
   * @param request - HTTP request
   * @returns True if content type is allowed, false otherwise
   */
  validateContentType(request: HttpRequest): boolean;

  /**
   * Validates header size
   * 
   * @param request - HTTP request
   * @returns True if header size is within limits, false otherwise
   */
  validateHeaderSize(request: HttpRequest): boolean;

  /**
   * Gets threat patterns for threat type
   * 
   * @param threatType - Type of threat
   * @returns Array of threat patterns
   */
  getThreatPatterns(threatType: ThreatType): string[];

  /**
   * Adds custom threat pattern
   * 
   * @param threatType - Type of threat
   * @param pattern - Pattern to add
   */
  addThreatPattern(threatType: ThreatType, pattern: string): void;

  /**
   * Removes threat pattern
   * 
   * @param threatType - Type of threat
   * @param pattern - Pattern to remove
   */
  removeThreatPattern(threatType: ThreatType, pattern: string): void;
}
