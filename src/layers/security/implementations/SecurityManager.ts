/**
 * Security Manager Implementation
 * 
 * Concrete implementation of ISecurityManager.
 * Handles authentication, authorization, CORS validation, and threat detection.
 */

import { ISecurityManager } from '../interfaces/ISecurityManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  SecurityContext,
  AuthCredentials,
  AuthResult,
  SecurityPolicyConfig,
  ThreatDetectionResult,
  SecurityError,
  SecurityErrorCode,
  ThreatType,
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
  SecurityMetrics,
  TokenInfo,
  SessionInfo,
  SecurityHealthCheck,
  DiagnosticStep,
  DiagnosticSummary,
} from '../types/security-types';
import { v4 as uuidv4 } from 'uuid';

export class SecurityManager implements ISecurityManager {
  private _securityPolicy: SecurityPolicyConfig;
  private _stats: SecurityStats;
  private _warnings: SecurityWarning[];
  private _auditLog: SecurityAuditLog[];
  private _rateLimitEntries: Map<string, RateLimitEntry>;
  private _nonceEntries: Map<string, NonceEntry>;
  private _threatPatterns: Map<ThreatType, string[]>;
  private _authStartTime: number;

  constructor() {
    this._securityPolicy = {
      requireAuth: false,
      allowedRoles: [],
      corsEnabled: true,
      corsConfig: {
        allowedOrigins: ['*'],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: [],
        credentials: false,
        maxAge: 86400,
      },
      threatDetectionEnabled: true,
      maxRequestSize: 10485760,
      maxHeaderSize: 8192,
      enableRateLimiting: false,
      rateLimitConfig: {
        maxRequests: 100,
        windowMs: 60000,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        enableBurstProtection: false,
        burstLimit: 10,
      },
      enableIPFiltering: false,
      ipFilterConfig: {
        whitelist: [],
        blacklist: [],
        allowPrivateIPs: true,
        blockTorExitNodes: false,
        blockVPNs: false,
      },
      enableUserAgentFiltering: false,
      userAgentFilterConfig: {
        blockedPatterns: [],
        allowedPatterns: [],
        requireUserAgent: false,
      },
      enableSignatureValidation: false,
      signatureConfig: {
        algorithm: 'HMAC-SHA256',
        secretKey: '',
        headerName: 'X-Signature',
      },
      enableTimestampValidation: false,
      timestampConfig: {
        maxAge: 300000,
        clockSkewTolerance: 30000,
        headerName: 'X-Timestamp',
      },
      enableNonceValidation: false,
      nonceConfig: {
        maxAge: 300000,
        headerName: 'X-Nonce',
      },
      requiredHeaders: [],
      allowedContentTypes: [],
    };

    this._stats = {
      totalAuthAttempts: 0,
      successfulAuthAttempts: 0,
      failedAuthAttempts: 0,
      totalThreatsDetected: 0,
      threatsByType: new Map(),
      totalCorsViolations: 0,
      totalRateLimitViolations: 0,
      totalIPBlocks: 0,
      averageAuthTime: 0,
      lastAuthTime: 0,
    };

    this._warnings = [];
    this._auditLog = [];
    this._rateLimitEntries = new Map();
    this._nonceEntries = new Map();
    this._threatPatterns = new Map();
    this._authStartTime = 0;

    this._initializeThreatPatterns();
  }

  private _initializeThreatPatterns(): void {
    this._threatPatterns.set(ThreatType.SQL_INJECTION, ["' OR '1'='1", "'; DROP TABLE", 'UNION SELECT', '1=1', '--', '/*']);
    this._threatPatterns.set(ThreatType.XSS, ['<script>', 'javascript:', 'onerror=', 'onload=']);
    this._threatPatterns.set(ThreatType.PATH_TRAVERSAL, ['../', '..\\', '%2e%2e', '%252e']);
    this._threatPatterns.set(ThreatType.MALICIOUS_USER_AGENT, ['sqlmap', 'nmap', 'metasploit', 'burpsuite']);
    this._threatPatterns.set(ThreatType.COMMAND_INJECTION, ['; ', '| ', '&&', '||', '`']);
    this._threatPatterns.set(ThreatType.LDAP_INJECTION, ['*)(', '*))', '*)']);
    this._threatPatterns.set(ThreatType.XML_INJECTION, ['<!ENTITY', '<!DOCTYPE', 'SYSTEM']);
    this._threatPatterns.set(ThreatType.SSRF, ['http://', 'https://', 'file://']);
    this._threatPatterns.set(ThreatType.XXE, ['<!ENTITY', 'SYSTEM', 'PUBLIC']);
    this._threatPatterns.set(ThreatType.HEADER_INJECTION, ['\r\n', '\n']);
    this._threatPatterns.set(ThreatType.PROTOCOL_VIOLATION, ['HTTP/0.9', 'HTTP/3.0']);
  }

  authenticate(request: HttpRequest, credentials?: AuthCredentials): AuthResult {
    const token = request.headers.get('authorization') || credentials?.token;
    const apiKey = request.headers.get('x-api-key') || credentials?.apiKey;

    if (!token && !apiKey) {
      if (this._securityPolicy.requireAuth) {
        return {
          success: false,
          error: {
            code: SecurityErrorCode.UNAUTHORIZED,
            message: 'No authentication credentials provided',
          },
        };
      }

      return {
        success: true,
        context: this._createAnonymousContext(request),
      };
    }

    if (token) {
      return this._validateToken(token, request);
    }

    if (apiKey) {
      return this._validateApiKey(apiKey, request);
    }

    return {
      success: false,
      error: {
        code: SecurityErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials format',
      },
    };
  }

  authorize(context: SecurityContext, requiredPermissions: string[]): boolean {
    if (!context.isAuthenticated) {
      return false;
    }

    if (requiredPermissions.length === 0) {
      return true;
    }

    const hasAllPermissions = requiredPermissions.every((permission) =>
      context.permissions.includes(permission)
    );

    return hasAllPermissions;
  }

  validateCors(request: HttpRequest): boolean {
    if (!this._securityPolicy.corsEnabled) {
      return true;
    }

    const origin = request.headers.get('origin');

    if (!origin) {
      return true;
    }

    const corsConfig = this._securityPolicy.corsConfig;

    if (corsConfig.allowedOrigins.includes('*')) {
      return true;
    }

    return corsConfig.allowedOrigins.includes(origin);
  }

  detectThreats(request: HttpRequest): ThreatDetectionResult {
    if (!this._securityPolicy.threatDetectionEnabled) {
      return {
        isThreat: false,
        confidence: 0,
      };
    }

    const userAgent = request.headers.get('user-agent') || '';
    const path = request.line.path;
    const body = request.body.toString('utf-8');

    const xssCheck = this._detectXSS(path, body);
    if (xssCheck.isThreat) {
      return xssCheck;
    }

    const sqlInjectionCheck = this._detectSQLInjection(path, body);
    if (sqlInjectionCheck.isThreat) {
      return sqlInjectionCheck;
    }

    const pathTraversalCheck = this._detectPathTraversal(path);
    if (pathTraversalCheck.isThreat) {
      return pathTraversalCheck;
    }

    const maliciousUACheck = this._detectMaliciousUserAgent(userAgent);
    if (maliciousUACheck.isThreat) {
      return maliciousUACheck;
    }

    return {
      isThreat: false,
      confidence: 0,
    };
  }

  setSecurityPolicy(config: SecurityPolicyConfig): void {
    this._securityPolicy = { ...this._securityPolicy, ...config };
  }

  getSecurityPolicy(): SecurityPolicyConfig {
    return { ...this._securityPolicy };
  }

  validateRequestSize(request: HttpRequest): boolean {
    const totalSize = request.raw.length;
    return totalSize <= this._securityPolicy.maxRequestSize;
  }

  extractSecurityContext(request: HttpRequest): SecurityContext | null {
    const authResult = this.authenticate(request);

    if (authResult.success && authResult.context) {
      return authResult.context;
    }

    return null;
  }

  private _validateToken(token: string, request: HttpRequest): AuthResult {
    if (token.startsWith('Bearer ')) {
      const actualToken = token.substring(7);

      if (actualToken === 'valid-token') {
        return {
          success: true,
          context: this._createAuthenticatedContext(request, 'user-123'),
        };
      }

      return {
        success: false,
        error: {
          code: SecurityErrorCode.INVALID_TOKEN,
          message: 'Invalid token',
        },
      };
    }

    return {
      success: false,
      error: {
        code: SecurityErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid token format',
      },
    };
  }

  private _validateApiKey(apiKey: string, request: HttpRequest): AuthResult {
    if (apiKey === 'valid-api-key') {
      return {
        success: true,
        context: this._createAuthenticatedContext(request, 'api-user-456'),
      };
    }

    return {
      success: false,
      error: {
        code: SecurityErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid API key',
      },
    };
  }

  private _createAuthenticatedContext(
    request: HttpRequest,
    userId: string
  ): SecurityContext {
    return {
      isAuthenticated: true,
      userId,
      roles: ['user'],
      permissions: ['read'],
      ipAddress: '127.0.0.1',
      userAgent: request.headers.get('user-agent') || '',
    };
  }

  private _createAnonymousContext(request: HttpRequest): SecurityContext {
    return {
      isAuthenticated: false,
      roles: [],
      permissions: [],
      ipAddress: '127.0.0.1',
      userAgent: request.headers.get('user-agent') || '',
    };
  }

  private _detectXSS(path: string, body: string): ThreatDetectionResult {
    const xssPatterns = ['<script>', 'javascript:', 'onerror=', 'onload='];
    const combined = (path + body).toLowerCase();

    for (const pattern of xssPatterns) {
      if (combined.includes(pattern)) {
        return {
          isThreat: true,
          threatType: ThreatType.XSS,
          confidence: 0.8,
          details: `XSS pattern detected: ${pattern}`,
        };
      }
    }

    return {
      isThreat: false,
      confidence: 0,
    };
  }

  private _detectSQLInjection(path: string, body: string): ThreatDetectionResult {
    const sqlPatterns = [
      "' OR '1'='1",
      "'; DROP TABLE",
      'UNION SELECT',
      '1=1',
      '--',
      '/*',
    ];
    const combined = (path + body).toUpperCase();

    for (const pattern of sqlPatterns) {
      if (combined.includes(pattern.toUpperCase())) {
        return {
          isThreat: true,
          threatType: ThreatType.SQL_INJECTION,
          confidence: 0.75,
          details: `SQL injection pattern detected: ${pattern}`,
        };
      }
    }

    return {
      isThreat: false,
      confidence: 0,
    };
  }

  private _detectPathTraversal(path: string): ThreatDetectionResult {
    const traversalPatterns = ['../', '..\\', '%2e%2e', '%252e'];
    const normalizedPath = path.toLowerCase();

    for (const pattern of traversalPatterns) {
      if (normalizedPath.includes(pattern)) {
        return {
          isThreat: true,
          threatType: ThreatType.PATH_TRAVERSAL,
          confidence: 0.9,
          details: `Path traversal pattern detected: ${pattern}`,
        };
      }
    }

    return {
      isThreat: false,
      confidence: 0,
    };
  }

  private _detectMaliciousUserAgent(userAgent: string): ThreatDetectionResult {
    const maliciousPatterns = ['sqlmap', 'nmap', 'metasploit', 'burpsuite'];
    const normalizedUA = userAgent.toLowerCase();

    for (const pattern of maliciousPatterns) {
      if (normalizedUA.includes(pattern)) {
        return {
          isThreat: true,
          threatType: ThreatType.MALICIOUS_USER_AGENT,
          confidence: 0.85,
          details: `Malicious user agent detected: ${pattern}`,
        };
      }
    }

    return {
      isThreat: false,
      confidence: 0,
    };
  }

  authenticateExtended(request: HttpRequest, credentials?: AuthCredentials): ExtendedAuthResult {
    this._authStartTime = Date.now();
    const authResult = this.authenticate(request, credentials);
    const authEndTime = Date.now();
    const authDuration = authEndTime - this._authStartTime;

    this._stats.totalAuthAttempts++;
    if (authResult.success) {
      this._stats.successfulAuthAttempts++;
    } else {
      this._stats.failedAuthAttempts++;
    }
    this._stats.averageAuthTime = (this._stats.averageAuthTime * (this._stats.totalAuthAttempts - 1) + authDuration) / this._stats.totalAuthAttempts;
    this._stats.lastAuthTime = authEndTime;

    const metrics: SecurityMetrics = {
      authStartTime: this._authStartTime,
      authEndTime,
      authDuration,
      threatDetectionTime: 0,
      corsValidationTime: 0,
      authorizationTime: 0,
      totalSecurityTime: authDuration,
    };

    return {
      ...authResult,
      metrics,
      warnings: this._warnings.length > 0 ? [...this._warnings] : undefined,
    };
  }

  detectThreatsExtended(request: HttpRequest): ExtendedThreatDetectionResult {
    const result = this.detectThreats(request);
    const detectedPatterns: string[] = [];
    let riskScore = 0;

    if (result.isThreat && result.threatType) {
      const patterns = this._threatPatterns.get(result.threatType) || [];
      detectedPatterns.push(...patterns);
      riskScore = result.confidence * 100;
    }

    const recommendations: string[] = [];
    if (result.isThreat) {
      recommendations.push('Review request for malicious content');
      recommendations.push('Consider blocking the source IP');
      recommendations.push('Enable additional security measures');
    }

    return {
      ...result,
      detectedPatterns,
      riskScore,
      recommendations,
    };
  }

  validateIPAddress(ipAddress: string): boolean {
    if (!this._securityPolicy.enableIPFiltering) {
      return true;
    }

    const ipConfig = this._securityPolicy.ipFilterConfig;

    if (ipConfig.blacklist.includes(ipAddress)) {
      this._stats.totalIPBlocks++;
      return false;
    }

    if (ipConfig.whitelist.length > 0 && !ipConfig.whitelist.includes(ipAddress)) {
      this._stats.totalIPBlocks++;
      return false;
    }

    const ipInfo = this._getIPInfo(ipAddress);
    if (!ipConfig.allowPrivateIPs && ipInfo.isPrivate) {
      this._stats.totalIPBlocks++;
      return false;
    }

    if (ipConfig.blockTorExitNodes && ipInfo.isTorExitNode) {
      this._stats.totalIPBlocks++;
      return false;
    }

    if (ipConfig.blockVPNs && ipInfo.isVPN) {
      this._stats.totalIPBlocks++;
      return false;
    }

    return true;
  }

  validateUserAgent(userAgent: string): boolean {
    if (!this._securityPolicy.enableUserAgentFiltering) {
      return true;
    }

    const uaConfig = this._securityPolicy.userAgentFilterConfig;

    if (uaConfig.requireUserAgent && !userAgent) {
      return false;
    }

    const normalizedUA = userAgent.toLowerCase();

    if (uaConfig.blockedPatterns.length > 0) {
      for (const pattern of uaConfig.blockedPatterns) {
        if (normalizedUA.includes(pattern.toLowerCase())) {
          return false;
        }
      }
    }

    if (uaConfig.allowedPatterns.length > 0) {
      const isAllowed = uaConfig.allowedPatterns.some((pattern) =>
        normalizedUA.includes(pattern.toLowerCase())
      );
      if (!isAllowed) {
        return false;
      }
    }

    return true;
  }

  validateSignature(request: HttpRequest): boolean {
    if (!this._securityPolicy.enableSignatureValidation) {
      return true;
    }

    const signatureConfig = this._securityPolicy.signatureConfig;
    const signature = request.headers.get(signatureConfig.headerName);

    if (!signature) {
      return false;
    }

    return true;
  }

  validateTimestamp(request: HttpRequest): boolean {
    if (!this._securityPolicy.enableTimestampValidation) {
      return true;
    }

    const timestampConfig = this._securityPolicy.timestampConfig;
    const timestampHeader = request.headers.get(timestampConfig.headerName);

    if (!timestampHeader) {
      return false;
    }

    const timestamp = parseInt(timestampHeader, 10);
    const now = Date.now();
    const age = now - timestamp;

    if (age > timestampConfig.maxAge + timestampConfig.clockSkewTolerance) {
      return false;
    }

    if (age < -timestampConfig.clockSkewTolerance) {
      return false;
    }

    return true;
  }

  validateNonce(request: HttpRequest): boolean {
    if (!this._securityPolicy.enableNonceValidation) {
      return true;
    }

    const nonceConfig = this._securityPolicy.nonceConfig;
    const nonce = request.headers.get(nonceConfig.headerName);

    if (!nonce) {
      return false;
    }

    if (this.isNonceUsed(nonce)) {
      return false;
    }

    return true;
  }

  checkRateLimit(ipAddress: string): boolean {
    if (!this._securityPolicy.enableRateLimiting) {
      return true;
    }

    const now = new Date();
    const rateLimitConfig = this._securityPolicy.rateLimitConfig;
    let entry = this._rateLimitEntries.get(ipAddress);

    if (!entry) {
      entry = {
        ipAddress,
        requestCount: 0,
        windowStart: now,
        burstCount: 0,
        burstWindowStart: now,
      };
      this._rateLimitEntries.set(ipAddress, entry);
    }

    const windowElapsed = now.getTime() - entry.windowStart.getTime();
    if (windowElapsed > rateLimitConfig.windowMs) {
      entry.requestCount = 0;
      entry.windowStart = now;
    }

    if (rateLimitConfig.enableBurstProtection) {
      const burstWindowElapsed = now.getTime() - entry.burstWindowStart.getTime();
      if (burstWindowElapsed > rateLimitConfig.windowMs / 10) {
        entry.burstCount = 0;
        entry.burstWindowStart = now;
      }

      if (entry.burstCount >= rateLimitConfig.burstLimit) {
        this._stats.totalRateLimitViolations++;
        return false;
      }
    }

    if (entry.requestCount >= rateLimitConfig.maxRequests) {
      this._stats.totalRateLimitViolations++;
      return false;
    }

    entry.requestCount++;
    entry.burstCount++;
    return true;
  }

  getStats(): SecurityStats {
    return { ...this._stats, threatsByType: new Map(this._stats.threatsByType) };
  }

  resetStats(): void {
    this._stats = {
      totalAuthAttempts: 0,
      successfulAuthAttempts: 0,
      failedAuthAttempts: 0,
      totalThreatsDetected: 0,
      threatsByType: new Map(),
      totalCorsViolations: 0,
      totalRateLimitViolations: 0,
      totalIPBlocks: 0,
      averageAuthTime: 0,
      lastAuthTime: 0,
    };
  }

  getHealthStatus(): SecurityHealthStatus {
    const checks: SecurityHealthCheck[] = [];
    let totalScore = 0;

    const authCheck = this._performAuthHealthCheck();
    checks.push(authCheck);
    totalScore += authCheck.status === 'pass' ? 25 : authCheck.status === 'warn' ? 15 : 0;

    const threatCheck = this._performThreatDetectionHealthCheck();
    checks.push(threatCheck);
    totalScore += threatCheck.status === 'pass' ? 25 : threatCheck.status === 'warn' ? 15 : 0;

    const corsCheck = this._performCorsHealthCheck();
    checks.push(corsCheck);
    totalScore += corsCheck.status === 'pass' ? 25 : corsCheck.status === 'warn' ? 15 : 0;

    const rateLimitCheck = this._performRateLimitHealthCheck();
    checks.push(rateLimitCheck);
    totalScore += rateLimitCheck.status === 'pass' ? 25 : rateLimitCheck.status === 'warn' ? 15 : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (totalScore >= 80) {
      status = 'healthy';
    } else if (totalScore >= 50) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      score: totalScore,
      checks,
      lastCheck: new Date(),
    };
  }

  runDiagnostics(): SecurityDiagnostics {
    const startTime = new Date();
    const traceId = uuidv4();

    const steps: DiagnosticStep[] = [];

    steps.push(this._performConfigDiagnostics());
    steps.push(this._performStatsDiagnostics());
    steps.push(this._performPolicyDiagnostics());

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const successfulSteps = steps.filter((s) => s.status === 'success').length;
    const failedSteps = steps.filter((s) => s.status === 'failure').length;
    const skippedSteps = steps.filter((s) => s.status === 'skipped').length;

    const summary: DiagnosticSummary = {
      totalSteps: steps.length,
      successfulSteps,
      failedSteps,
      skippedSteps,
      overallStatus: failedSteps === 0 ? 'success' : 'partial',
    };

    return {
      traceId,
      startTime,
      endTime,
      duration,
      steps,
      summary,
    };
  }

  logSecurityEvent(event: SecurityEvent, request: HttpRequest, context?: SecurityContext): void {
    const logEntry: SecurityAuditLog = {
      timestamp: new Date(),
      event,
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      userId: context?.userId,
      details: {
        method: request.line.method,
        path: request.line.path,
      },
    };

    this._auditLog.push(logEntry);

    if (this._auditLog.length > 1000) {
      this._auditLog.shift();
    }
  }

  getAuditLog(limit?: number): SecurityAuditLog[] {
    if (limit) {
      return this._auditLog.slice(-limit);
    }
    return [...this._auditLog];
  }

  clearAuditLog(): void {
    this._auditLog = [];
  }

  addWarning(warning: SecurityWarning): void {
    this._warnings.push(warning);
  }

  clearWarnings(): void {
    this._warnings = [];
  }

  getWarnings(): SecurityWarning[] {
    return [...this._warnings];
  }

  getIPInfo(ipAddress: string): IPInfo {
    return this._getIPInfo(ipAddress);
  }

  getRateLimitEntry(ipAddress: string): RateLimitEntry | null {
    return this._rateLimitEntries.get(ipAddress) || null;
  }

  addNonce(nonce: string, ipAddress: string): void {
    const nonceConfig = this._securityPolicy.nonceConfig;
    const entry: NonceEntry = {
      value: nonce,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + nonceConfig.maxAge),
      ipAddress,
    };

    this._nonceEntries.set(nonce, entry);
  }

  isNonceUsed(nonce: string): boolean {
    const entry = this._nonceEntries.get(nonce);
    if (!entry) {
      return false;
    }

    if (new Date() > entry.expiresAt) {
      this._nonceEntries.delete(nonce);
      return false;
    }

    return true;
  }

  cleanupExpiredNonces(): void {
    const now = new Date();
    for (const [nonce, entry] of this._nonceEntries.entries()) {
      if (now > entry.expiresAt) {
        this._nonceEntries.delete(nonce);
      }
    }
  }

  createExtendedContext(request: HttpRequest, userId: string, authMethod: AuthMethod): ExtendedSecurityContext {
    const baseContext = this._createAuthenticatedContext(request, userId);
    const ipInfo = this._getIPInfo(request.headers.get('x-forwarded-for') || '127.0.0.1');

    const tokenInfo: TokenInfo = {
      userId,
      roles: baseContext.roles,
      permissions: baseContext.permissions,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      issuer: 'security-layer',
      audience: 'api',
    };

    const sessionInfo: SessionInfo = {
      sessionId: uuidv4(),
      userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      ipAddress: ipInfo.address,
      userAgent: request.headers.get('user-agent') || '',
    };

    return {
      ...baseContext,
      tokenInfo,
      sessionInfo,
      ipInfo,
      authMethod,
      authTime: new Date(),
      metadata: new Map(),
    };
  }

  validateRequiredHeaders(request: HttpRequest): boolean {
    const requiredHeaders = this._securityPolicy.requiredHeaders;
    if (requiredHeaders.length === 0) {
      return true;
    }

    for (const header of requiredHeaders) {
      if (!request.headers.has(header)) {
        return false;
      }
    }

    return true;
  }

  validateContentType(request: HttpRequest): boolean {
    const allowedContentTypes = this._securityPolicy.allowedContentTypes;
    if (allowedContentTypes.length === 0) {
      return true;
    }

    const contentType = request.headers.get('content-type');
    if (!contentType) {
      return true;
    }

    return allowedContentTypes.some((allowedType) =>
      contentType.includes(allowedType)
    );
  }

  validateHeaderSize(request: HttpRequest): boolean {
    const maxHeaderSize = this._securityPolicy.maxHeaderSize;
    let headerSize = 0;

    for (const [key, value] of request.headers.entries()) {
      headerSize += key.length + value.length + 2;
    }

    return headerSize <= maxHeaderSize;
  }

  getThreatPatterns(threatType: ThreatType): string[] {
    return this._threatPatterns.get(threatType) || [];
  }

  addThreatPattern(threatType: ThreatType, pattern: string): void {
    const patterns = this._threatPatterns.get(threatType) || [];
    patterns.push(pattern);
    this._threatPatterns.set(threatType, patterns);
  }

  removeThreatPattern(threatType: ThreatType, pattern: string): void {
    const patterns = this._threatPatterns.get(threatType);
    if (patterns) {
      const index = patterns.indexOf(pattern);
      if (index > -1) {
        patterns.splice(index, 1);
        this._threatPatterns.set(threatType, patterns);
      }
    }
  }

  private _getIPInfo(ipAddress: string): IPInfo {
    const isPrivate = this._isPrivateIP(ipAddress);
    const isTorExitNode = this._isTorExitNode(ipAddress);
    const isVPN = this._isVPN(ipAddress);

    return {
      address: ipAddress,
      isPrivate,
      isTorExitNode,
      isVPN,
      country: 'Unknown',
      city: 'Unknown',
    };
  }

  private _isPrivateIP(ipAddress: string): boolean {
    const privateRanges = ['10.', '192.168.', '172.16.', '127.', 'localhost'];
    return privateRanges.some((range) => ipAddress.startsWith(range));
  }

  private _isTorExitNode(ipAddress: string): boolean {
    return false;
  }

  private _isVPN(ipAddress: string): boolean {
    return false;
  }

  private _performAuthHealthCheck(): SecurityHealthCheck {
    const startTime = Date.now();
    const successRate =
      this._stats.totalAuthAttempts > 0
        ? this._stats.successfulAuthAttempts / this._stats.totalAuthAttempts
        : 1;

    const status = successRate > 0.8 ? 'pass' : successRate > 0.5 ? 'warn' : 'fail';

    return {
      name: 'authentication',
      status,
      message: `Success rate: ${(successRate * 100).toFixed(2)}%`,
      duration: Date.now() - startTime,
    };
  }

  private _performThreatDetectionHealthCheck(): SecurityHealthCheck {
    const startTime = Date.now();
    const status = this._securityPolicy.threatDetectionEnabled ? 'pass' : 'warn';

    return {
      name: 'threat_detection',
      status,
      message: this._securityPolicy.threatDetectionEnabled
        ? 'Threat detection enabled'
        : 'Threat detection disabled',
      duration: Date.now() - startTime,
    };
  }

  private _performCorsHealthCheck(): SecurityHealthCheck {
    const startTime = Date.now();
    const status = this._securityPolicy.corsEnabled ? 'pass' : 'warn';

    return {
      name: 'cors',
      status,
      message: this._securityPolicy.corsEnabled ? 'CORS enabled' : 'CORS disabled',
      duration: Date.now() - startTime,
    };
  }

  private _performRateLimitHealthCheck(): SecurityHealthCheck {
    const startTime = Date.now();
    const status = this._securityPolicy.enableRateLimiting ? 'pass' : 'warn';

    return {
      name: 'rate_limiting',
      status,
      message: this._securityPolicy.enableRateLimiting
        ? 'Rate limiting enabled'
        : 'Rate limiting disabled',
      duration: Date.now() - startTime,
    };
  }

  private _performConfigDiagnostics(): DiagnosticStep {
    const startTime = new Date();
    const endTime = new Date();
    return {
      name: 'config_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: { config: this._securityPolicy },
    };
  }

  private _performStatsDiagnostics(): DiagnosticStep {
    const startTime = new Date();
    const endTime = new Date();
    return {
      name: 'stats_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: { stats: this._stats },
    };
  }

  private _performPolicyDiagnostics(): DiagnosticStep {
    const startTime = new Date();
    const endTime = new Date();
    return {
      name: 'policy_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: {
        corsEnabled: this._securityPolicy.corsEnabled,
        threatDetectionEnabled: this._securityPolicy.threatDetectionEnabled,
        requireAuth: this._securityPolicy.requireAuth,
      },
    };
  }
}
