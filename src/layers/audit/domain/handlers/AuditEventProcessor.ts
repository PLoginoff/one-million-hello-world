/**
 * Audit Event Processor
 *
 * Real business logic for processing Audit events.
 * Handles access control, resource changes, security events, compliance, and user activity.
 */

import { IAudit } from '../../interfaces/IAudit';
import {
  AuditEventType,
  AuditDomainEvent,
  AuditEventPayload,
  AccessGrantedPayload,
  AccessDeniedPayload,
  ResourceChangedPayload,
  ResourceAccessedPayload,
  PermissionChangedPayload,
  RoleChangedPayload,
  PolicyChangedPayload,
  DataTransferPayload,
  ConfigChangedPayload,
  SecurityEventPayload,
  ComplianceCheckPayload,
  SessionPayload,
  LoginPayload,
  LogoutPayload,
  CredentialChangedPayload,
  ApiKeyPayload,
} from '../events/AuditEventTypes';

export interface AuditProcessorConfig {
  enableValidation: boolean;
  enableEnrichment: boolean;
  enableAccessTracking: boolean;
  enableResourceTracking: boolean;
  enableSecurityTracking: boolean;
  enableComplianceTracking: boolean;
  enableSessionTracking: boolean;
  enableCredentialTracking: boolean;
  maxEventSize: number;
  allowedEventTypes: AuditEventType[];
  piiFields: string[];
  sensitiveResources: string[];
}

export interface EnrichedEvent extends AuditDomainEvent {
  enriched: boolean;
  userId?: string;
  sessionId?: string;
  resourceId?: string;
  resourceType?: string;
  ipAddress?: string;
  severity?: string;
  processingTimeMs: number;
}

export interface AccessMetrics {
  resourceId: string;
  resourceType: string;
  grantedCount: number;
  deniedCount: number;
  uniqueUsers: Set<string>;
  lastAccessAt: number;
  deniedReasons: Record<string, number>;
}

export interface ResourceMetrics {
  resourceId: string;
  resourceType: string;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  accessedCount: number;
  uniqueUsers: Set<string>;
  lastModifiedAt: number;
}

export interface UserActivityMetrics {
  userId: string;
  loginCount: number;
  failedLoginCount: number;
  sessionCount: number;
  totalSessionDurationMs: number;
  lastLoginAt: number;
  lastLogoutAt: number;
  mfaEnabledCount: number;
  apiKeyCount: number;
  accessGrantedCount: number;
  accessDeniedCount: number;
}

export interface SecurityMetrics {
  eventType: string;
  severity: string;
  count: number;
  uniqueUsers: Set<string>;
  uniqueIps: Set<string>;
  lastOccurrenceAt: number;
  mitigatedCount: number;
}

export interface ComplianceMetrics {
  framework: string;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  skippedCount: number;
  lastCheckAt: number;
  resourcesChecked: Set<string>;
}

export class AuditEventProcessor {
  private _config: AuditProcessorConfig;
  private _adapters: Map<string, IAudit>;
  private _accessMetrics: Map<string, AccessMetrics>;
  private _resourceMetrics: Map<string, ResourceMetrics>;
  private _userActivityMetrics: Map<string, UserActivityMetrics>;
  private _securityMetrics: Map<string, SecurityMetrics>;
  private _complianceMetrics: Map<string, ComplianceMetrics>;
  private _activeSessions: Map<string, SessionPayload>;
  private _eventCounts: Map<string, number>;
  private _errorCounts: Map<string, number>;
  private _processingTimes: number[];
  private _startTime: number;

  constructor(config: Partial<AuditProcessorConfig> = {}) {
    this._config = {
      enableValidation: true,
      enableEnrichment: true,
      enableAccessTracking: true,
      enableResourceTracking: true,
      enableSecurityTracking: true,
      enableComplianceTracking: true,
      enableSessionTracking: true,
      enableCredentialTracking: true,
      maxEventSize: 1024 * 1024,
      allowedEventTypes: Object.values(AuditEventType),
      piiFields: [
        'password',
        'token',
        'secret',
        'key',
        'credential',
        'ssn',
        'credit_card',
        'api_key',
        'authorization',
        'cookie',
      ],
      sensitiveResources: ['user', 'account', 'payment', 'credential', 'secret', 'key', 'token', 'password'],
      ...config,
    };

    this._adapters = new Map();
    this._accessMetrics = new Map();
    this._resourceMetrics = new Map();
    this._userActivityMetrics = new Map();
    this._securityMetrics = new Map();
    this._complianceMetrics = new Map();
    this._activeSessions = new Map();
    this._eventCounts = new Map();
    this._errorCounts = new Map();
    this._processingTimes = [];
    this._startTime = Date.now();

    this._startCleanupInterval();
  }

  registerAdapter(name: string, adapter: IAudit): void {
    this._adapters.set(name, adapter);
  }

  unregisterAdapter(name: string): void {
    this._adapters.delete(name);
  }

  async processEvent(event: AuditDomainEvent): Promise<EnrichedEvent> {
    const startTime = Date.now();

    try {
      const validatedEvent = this._validateEvent(event);
      const enrichedEvent = this._enrichEvent(validatedEvent);
      await this._routeEvent(enrichedEvent);
      this._updateMetrics(enrichedEvent);

      const processingTime = Date.now() - startTime;
      this._recordProcessingTime(processingTime);
      this._incrementEventCount(enrichedEvent.type);

      return { ...enrichedEvent, processingTimeMs: processingTime };
    } catch (error) {
      this._incrementErrorCount(event.type);
      throw error;
    }
  }

  async processBatch(events: AuditDomainEvent[]): Promise<EnrichedEvent[]> {
    const results: EnrichedEvent[] = [];
    for (const event of events) {
      try {
        const result = await this.processEvent(event);
        results.push(result);
      } catch (error) {
        this._incrementErrorCount(event.type);
        results.push({
          ...event,
          enriched: false,
          processingTimeMs: 0,
        } as EnrichedEvent);
      }
    }
    return results;
  }

  getAccessMetrics(resourceId: string): AccessMetrics | undefined {
    return this._accessMetrics.get(resourceId);
  }

  getAllAccessMetrics(): AccessMetrics[] {
    return Array.from(this._accessMetrics.values());
  }

  getResourceMetrics(resourceId: string): ResourceMetrics | undefined {
    return this._resourceMetrics.get(resourceId);
  }

  getAllResourceMetrics(): ResourceMetrics[] {
    return Array.from(this._resourceMetrics.values());
  }

  getUserActivityMetrics(userId: string): UserActivityMetrics | undefined {
    return this._userActivityMetrics.get(userId);
  }

  getAllUserActivityMetrics(): UserActivityMetrics[] {
    return Array.from(this._userActivityMetrics.values());
  }

  getSecurityMetrics(eventType: string): SecurityMetrics | undefined {
    return this._securityMetrics.get(eventType);
  }

  getAllSecurityMetrics(): SecurityMetrics[] {
    return Array.from(this._securityMetrics.values());
  }

  getComplianceMetrics(framework: string): ComplianceMetrics | undefined {
    return this._complianceMetrics.get(framework);
  }

  getAllComplianceMetrics(): ComplianceMetrics[] {
    return Array.from(this._complianceMetrics.values());
  }

  getActiveSession(sessionId: string): SessionPayload | undefined {
    return this._activeSessions.get(sessionId);
  }

  getAllActiveSessions(): SessionPayload[] {
    return Array.from(this._activeSessions.values());
  }

  getEventCounts(): Record<string, number> {
    return Object.fromEntries(this._eventCounts);
  }

  getErrorCounts(): Record<string, number> {
    return Object.fromEntries(this._errorCounts);
  }

  getAverageProcessingTime(): number {
    if (this._processingTimes.length === 0) return 0;
    const sum = this._processingTimes.reduce((a, b) => a + b, 0);
    return sum / this._processingTimes.length;
  }

  getUptime(): number {
    return Date.now() - this._startTime;
  }

  getAdapterStatus(): Record<string, Record<string, unknown>> {
    const status: Record<string, Record<string, unknown>> = {};
    for (const [name, adapter] of this._adapters) {
      status[name] = adapter.getStatus();
    }
    return status;
  }

  private _validateEvent(event: AuditDomainEvent): AuditDomainEvent {
    if (!this._config.enableValidation) return event;

    if (!this._config.allowedEventTypes.includes(event.type)) {
      throw new Error(`Event type not allowed: ${event.type}`);
    }

    if (event.payload === null || event.payload === undefined || typeof event.payload !== 'object') {
      throw new Error('Event payload is required and must be an object');
    }

    const eventSize = JSON.stringify(event).length;
    if (eventSize > this._config.maxEventSize) {
      throw new Error(`Event size exceeds maximum: ${eventSize} > ${this._config.maxEventSize}`);
    }

    this._sanitizePii(event.payload);

    return event;
  }

  private _sanitizePii(payload: AuditEventPayload): void {
    const sanitize = (obj: unknown, path: string = ''): void => {
      if (obj === null || obj === undefined || typeof obj !== 'object') return;
      const record = obj as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (this._config.piiFields.some((pii) => fullPath.toLowerCase().includes(pii.toLowerCase()))) {
          record[key] = '[REDACTED]';
        } else {
          const value = record[key];
          if (value !== null && value !== undefined && typeof value === 'object') {
            sanitize(value, fullPath);
          }
        }
      }
    };
    sanitize(payload);
  }

  private _enrichEvent(event: AuditDomainEvent): EnrichedEvent {
    if (!this._config.enableEnrichment) {
      return { ...event, enriched: false, processingTimeMs: 0 };
    }

    const enriched: EnrichedEvent = {
      ...event,
      enriched: true,
      processingTimeMs: 0,
    };

    const payload = event.payload;

    switch (event.type) {
      case AuditEventType.ACCESS_GRANTED: {
        const access = payload as AccessGrantedPayload;
        enriched.userId = access.userId;
        enriched.sessionId = access.sessionId;
        enriched.resourceId = access.resourceId;
        enriched.resourceType = access.resourceType;
        enriched.ipAddress = access.ipAddress;
        break;
      }
      case AuditEventType.ACCESS_DENIED: {
        const denied = payload as AccessDeniedPayload;
        enriched.userId = denied.userId;
        enriched.sessionId = denied.sessionId;
        enriched.resourceId = denied.resourceId;
        enriched.resourceType = denied.resourceType;
        enriched.ipAddress = denied.ipAddress;
        break;
      }
      case AuditEventType.RESOURCE_CREATED:
      case AuditEventType.RESOURCE_UPDATED:
      case AuditEventType.RESOURCE_DELETED: {
        const resource = payload as ResourceChangedPayload;
        enriched.userId = resource.userId;
        enriched.sessionId = resource.sessionId;
        enriched.resourceId = resource.resourceId;
        enriched.resourceType = resource.resourceType;
        enriched.ipAddress = resource.ipAddress;
        break;
      }
      case AuditEventType.RESOURCE_ACCESSED: {
        const access = payload as ResourceAccessedPayload;
        enriched.userId = access.userId;
        enriched.sessionId = access.sessionId;
        enriched.resourceId = access.resourceId;
        enriched.resourceType = access.resourceType;
        enriched.ipAddress = access.ipAddress;
        break;
      }
      case AuditEventType.PERMISSION_CHANGED: {
        const perm = payload as PermissionChangedPayload;
        enriched.userId = perm.targetUserId;
        enriched.sessionId = perm.sessionId;
        enriched.resourceId = perm.resourceId;
        enriched.resourceType = perm.resourceType;
        enriched.ipAddress = perm.ipAddress;
        break;
      }
      case AuditEventType.ROLE_ASSIGNED:
      case AuditEventType.ROLE_REVOKED: {
        const role = payload as RoleChangedPayload;
        enriched.userId = role.targetUserId;
        enriched.sessionId = role.sessionId;
        enriched.ipAddress = role.ipAddress;
        break;
      }
      case AuditEventType.POLICY_CREATED:
      case AuditEventType.POLICY_UPDATED:
      case AuditEventType.POLICY_DELETED: {
        const policy = payload as PolicyChangedPayload;
        enriched.userId = policy.changedBy;
        enriched.sessionId = policy.sessionId;
        enriched.ipAddress = policy.ipAddress;
        break;
      }
      case AuditEventType.DATA_EXPORTED:
      case AuditEventType.DATA_IMPORTED: {
        const data = payload as DataTransferPayload;
        enriched.userId = data.userId;
        enriched.sessionId = data.sessionId;
        enriched.ipAddress = data.ipAddress;
        break;
      }
      case AuditEventType.CONFIG_CHANGED: {
        const config = payload as ConfigChangedPayload;
        enriched.userId = config.changedBy;
        enriched.sessionId = config.sessionId;
        enriched.ipAddress = config.ipAddress;
        break;
      }
      case AuditEventType.SECURITY_EVENT: {
        const security = payload as SecurityEventPayload;
        enriched.userId = security.userId;
        enriched.sessionId = security.sessionId;
        enriched.ipAddress = security.ipAddress;
        enriched.severity = security.severity;
        break;
      }
      case AuditEventType.COMPLIANCE_CHECK: {
        const compliance = payload as ComplianceCheckPayload;
        enriched.userId = compliance.checkedBy;
        enriched.ipAddress = undefined;
        break;
      }
      case AuditEventType.SESSION_STARTED:
      case AuditEventType.LOGIN_SUCCESS: {
        const session = payload as SessionPayload | LoginPayload;
        enriched.userId = session.userId;
        enriched.sessionId = session.sessionId;
        enriched.ipAddress = session.ipAddress;
        break;
      }
      case AuditEventType.SESSION_ENDED:
      case AuditEventType.LOGOUT: {
        const logout = payload as LogoutPayload;
        enriched.userId = logout.userId;
        enriched.sessionId = logout.sessionId;
        enriched.ipAddress = logout.ipAddress;
        break;
      }
      case AuditEventType.LOGIN_FAILED: {
        const login = payload as LoginPayload;
        enriched.userId = login.userId;
        enriched.sessionId = login.sessionId;
        enriched.ipAddress = login.ipAddress;
        break;
      }
      case AuditEventType.PASSWORD_CHANGED:
      case AuditEventType.MFA_ENABLED:
      case AuditEventType.MFA_DISABLED: {
        const cred = payload as CredentialChangedPayload;
        enriched.userId = cred.userId;
        enriched.sessionId = cred.sessionId;
        enriched.ipAddress = cred.ipAddress;
        break;
      }
      case AuditEventType.API_KEY_CREATED:
      case AuditEventType.API_KEY_REVOKED: {
        const apiKey = payload as ApiKeyPayload;
        enriched.userId = apiKey.userId;
        enriched.ipAddress = apiKey.ipAddress;
        break;
      }
    }

    return enriched;
  }

  private async _routeEvent(event: EnrichedEvent): Promise<void> {
    const context = {
      input: event,
      metadata: {
        eventId: event.eventId,
        eventType: event.type,
        timestamp: event.timestamp,
        source: event.source,
        correlationId: event.correlationId,
        enriched: event.enriched,
        userId: event.userId,
        sessionId: event.sessionId,
        resourceId: event.resourceId,
        resourceType: event.resourceType,
        ipAddress: event.ipAddress,
        severity: event.severity,
      },
      timestamp: new Date(event.timestamp),
    };
    for (const [name, adapter] of this._adapters) {
      try {
        await adapter.execute(context);
      } catch (error) {
        console.error(`Adapter ${name} failed:`, error);
      }
    }
  }

  private _updateMetrics(event: EnrichedEvent): void {
    switch (event.type) {
      case AuditEventType.ACCESS_GRANTED: {
        if (this._config.enableAccessTracking) {
          const access = event.payload as AccessGrantedPayload;
          this._updateAccessMetrics(access.resourceId, access.resourceType, true, access.userId, access.ipAddress);
          this._updateUserActivity(access.userId, 'access_granted');
        }
        break;
      }
      case AuditEventType.ACCESS_DENIED: {
        if (this._config.enableAccessTracking) {
          const denied = event.payload as AccessDeniedPayload;
          this._updateAccessMetrics(
            denied.resourceId,
            denied.resourceType,
            false,
            denied.userId,
            denied.ipAddress,
            denied.reason
          );
          this._updateUserActivity(denied.userId, 'access_denied');
        }
        break;
      }
      case AuditEventType.RESOURCE_CREATED: {
        if (this._config.enableResourceTracking) {
          const resource = event.payload as ResourceChangedPayload;
          this._updateResourceMetrics(
            resource.resourceId,
            resource.resourceType,
            'created',
            resource.userId,
            resource.ipAddress
          );
        }
        break;
      }
      case AuditEventType.RESOURCE_UPDATED: {
        if (this._config.enableResourceTracking) {
          const resource = event.payload as ResourceChangedPayload;
          this._updateResourceMetrics(
            resource.resourceId,
            resource.resourceType,
            'updated',
            resource.userId,
            resource.ipAddress
          );
        }
        break;
      }
      case AuditEventType.RESOURCE_DELETED: {
        if (this._config.enableResourceTracking) {
          const resource = event.payload as ResourceChangedPayload;
          this._updateResourceMetrics(
            resource.resourceId,
            resource.resourceType,
            'deleted',
            resource.userId,
            resource.ipAddress
          );
        }
        break;
      }
      case AuditEventType.RESOURCE_ACCESSED: {
        if (this._config.enableResourceTracking) {
          const access = event.payload as ResourceAccessedPayload;
          this._updateResourceMetrics(
            access.resourceId,
            access.resourceType,
            'accessed',
            access.userId,
            access.ipAddress
          );
        }
        break;
      }
      case AuditEventType.PERMISSION_CHANGED: {
        const perm = event.payload as PermissionChangedPayload;
        if (perm.resourceId !== undefined && perm.resourceId !== '') {
          this._updateResourceMetrics(
            perm.resourceId,
            perm.resourceType !== undefined && perm.resourceType !== '' ? perm.resourceType : 'unknown',
            'permission_changed',
            perm.targetUserId,
            perm.ipAddress
          );
        }
        break;
      }
      case AuditEventType.ROLE_ASSIGNED:
      case AuditEventType.ROLE_REVOKED: {
        const role = event.payload as RoleChangedPayload;
        this._updateUserActivity(role.targetUserId, 'role_changed');
        break;
      }
      case AuditEventType.POLICY_CREATED:
      case AuditEventType.POLICY_UPDATED:
      case AuditEventType.POLICY_DELETED: {
        const policy = event.payload as PolicyChangedPayload;
        this._updateUserActivity(policy.changedBy, 'policy_changed');
        break;
      }
      case AuditEventType.DATA_EXPORTED:
      case AuditEventType.DATA_IMPORTED: {
        const data = event.payload as DataTransferPayload;
        this._updateUserActivity(data.userId, 'data_transfer');
        break;
      }
      case AuditEventType.CONFIG_CHANGED: {
        const config = event.payload as ConfigChangedPayload;
        this._updateUserActivity(config.changedBy, 'config_changed');
        break;
      }
      case AuditEventType.SECURITY_EVENT: {
        if (this._config.enableSecurityTracking) {
          const security = event.payload as SecurityEventPayload;
          this._updateSecurityMetrics(
            security.eventType,
            security.severity,
            security.userId,
            security.ipAddress,
            security.mitigated
          );
        }
        break;
      }
      case AuditEventType.COMPLIANCE_CHECK: {
        if (this._config.enableComplianceTracking) {
          const compliance = event.payload as ComplianceCheckPayload;
          this._updateComplianceMetrics(compliance.framework, compliance.status, compliance.resourceId);
        }
        break;
      }
      case AuditEventType.SESSION_STARTED:
      case AuditEventType.LOGIN_SUCCESS: {
        if (this._config.enableSessionTracking) {
          const session = event.payload as SessionPayload | LoginPayload;
          const sessionId = session.sessionId !== undefined && session.sessionId !== '' ? session.sessionId : '';
          this._createSession(sessionId, session);
          this._updateUserActivity(session.userId, 'login_success');
        }
        break;
      }
      case AuditEventType.LOGIN_FAILED: {
        if (this._config.enableSessionTracking) {
          const login = event.payload as LoginPayload;
          this._updateUserActivity(login.userId, 'login_failed');
        }
        break;
      }
      case AuditEventType.SESSION_ENDED:
      case AuditEventType.LOGOUT: {
        if (this._config.enableSessionTracking) {
          const logout = event.payload as LogoutPayload;
          this._endSession(logout.sessionId, logout.userId, logout.sessionDurationMs);
          this._updateUserActivity(logout.userId, 'logout');
        }
        break;
      }
      case AuditEventType.PASSWORD_CHANGED:
      case AuditEventType.MFA_ENABLED:
      case AuditEventType.MFA_DISABLED: {
        if (this._config.enableCredentialTracking) {
          const cred = event.payload as CredentialChangedPayload;
          this._updateUserActivity(cred.userId, 'credential_changed');
        }
        break;
      }
      case AuditEventType.API_KEY_CREATED:
      case AuditEventType.API_KEY_REVOKED: {
        if (this._config.enableCredentialTracking) {
          const apiKey = event.payload as ApiKeyPayload;
          this._updateUserActivity(apiKey.userId, 'api_key_changed');
        }
        break;
      }
    }
  }

  private _updateAccessMetrics(
    resourceId: string,
    resourceType: string,
    granted: boolean,
    userId: string,
    ipAddress?: string,
    reason?: string
  ): void {
    const key = `${resourceType}:${resourceId}`;
    let metrics = this._accessMetrics.get(key);
    if (!metrics) {
      metrics = {
        resourceId,
        resourceType,
        grantedCount: 0,
        deniedCount: 0,
        uniqueUsers: new Set(),
        lastAccessAt: 0,
        deniedReasons: {},
      };
      this._accessMetrics.set(key, metrics);
    }

    if (granted) {
      metrics.grantedCount++;
    } else {
      metrics.deniedCount++;
      if (reason !== undefined && reason !== '') {
        metrics.deniedReasons[reason] = (metrics.deniedReasons[reason] ?? 0) + 1;
      }
    }
    metrics.uniqueUsers.add(userId);
    metrics.lastAccessAt = Date.now();
  }

  private _updateResourceMetrics(
    resourceId: string,
    resourceType: string,
    operation: 'created' | 'updated' | 'deleted' | 'accessed' | 'permission_changed',
    userId: string,
    _ipAddress?: string
  ): void {
    const key = `${resourceType}:${resourceId}`;
    let metrics = this._resourceMetrics.get(key);
    if (!metrics) {
      metrics = {
        resourceId,
        resourceType,
        createdCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        accessedCount: 0,
        uniqueUsers: new Set(),
        lastModifiedAt: 0,
      };
      this._resourceMetrics.set(key, metrics);
    }

    switch (operation) {
      case 'created':
        metrics.createdCount++;
        break;
      case 'updated':
        metrics.updatedCount++;
        break;
      case 'deleted':
        metrics.deletedCount++;
        break;
      case 'accessed':
        metrics.accessedCount++;
        break;
      case 'permission_changed':
        metrics.updatedCount++;
        break;
    }
    metrics.uniqueUsers.add(userId);
    metrics.lastModifiedAt = Date.now();
  }

  private _updateUserActivity(
    userId: string,
    activity:
      | 'access_granted'
      | 'access_denied'
      | 'login_success'
      | 'login_failed'
      | 'logout'
      | 'role_changed'
      | 'policy_changed'
      | 'data_transfer'
      | 'config_changed'
      | 'credential_changed'
      | 'api_key_changed'
  ): void {
    let metrics = this._userActivityMetrics.get(userId);
    if (!metrics) {
      metrics = {
        userId,
        loginCount: 0,
        failedLoginCount: 0,
        sessionCount: 0,
        totalSessionDurationMs: 0,
        lastLoginAt: 0,
        lastLogoutAt: 0,
        mfaEnabledCount: 0,
        apiKeyCount: 0,
        accessGrantedCount: 0,
        accessDeniedCount: 0,
      };
      this._userActivityMetrics.set(userId, metrics);
    }

    switch (activity) {
      case 'login_success':
        metrics.loginCount++;
        metrics.lastLoginAt = Date.now();
        break;
      case 'login_failed':
        metrics.failedLoginCount++;
        break;
      case 'logout':
        metrics.lastLogoutAt = Date.now();
        break;
      case 'access_granted':
        metrics.accessGrantedCount++;
        break;
      case 'access_denied':
        metrics.accessDeniedCount++;
        break;
      case 'role_changed':
        break;
      case 'policy_changed':
        break;
      case 'data_transfer':
        break;
      case 'config_changed':
        break;
      case 'credential_changed':
        break;
      case 'api_key_changed':
        metrics.apiKeyCount++;
        break;
    }
  }

  private _updateSecurityMetrics(
    eventType: string,
    severity: string,
    userId?: string,
    ipAddress?: string,
    mitigated?: boolean
  ): void {
    const key = `${eventType}:${severity}`;
    let metrics = this._securityMetrics.get(key);
    if (!metrics) {
      metrics = {
        eventType,
        severity,
        count: 0,
        uniqueUsers: new Set(),
        uniqueIps: new Set(),
        lastOccurrenceAt: 0,
        mitigatedCount: 0,
      };
      this._securityMetrics.set(key, metrics);
    }

    metrics.count++;
    if (userId !== undefined && userId !== '') metrics.uniqueUsers.add(userId);
    if (ipAddress !== undefined && ipAddress !== '') metrics.uniqueIps.add(ipAddress);
    metrics.lastOccurrenceAt = Date.now();
    if (mitigated === true) metrics.mitigatedCount++;
  }

  private _updateComplianceMetrics(framework: string, status: string, resourceId?: string): void {
    let metrics = this._complianceMetrics.get(framework);
    if (!metrics) {
      metrics = {
        framework,
        passedCount: 0,
        failedCount: 0,
        warningCount: 0,
        skippedCount: 0,
        lastCheckAt: 0,
        resourcesChecked: new Set(),
      };
      this._complianceMetrics.set(framework, metrics);
    }

    switch (status) {
      case 'passed':
        metrics.passedCount++;
        break;
      case 'failed':
        metrics.failedCount++;
        break;
      case 'warning':
        metrics.warningCount++;
        break;
      case 'skipped':
        metrics.skippedCount++;
        break;
    }
    metrics.lastCheckAt = Date.now();
    if (resourceId !== undefined && resourceId !== '') metrics.resourcesChecked.add(resourceId);
  }

  private _createSession(sessionId: string, session: SessionPayload | LoginPayload): void {
    if (!sessionId) return;
    const sessionData: SessionPayload = {
      sessionId,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      authMethod: session.authMethod,
      mfaUsed: session.mfaUsed,
      deviceFingerprint: session.deviceFingerprint,
      location: session.location,
    };
    this._activeSessions.set(sessionId, sessionData);

    const userMetrics = this._userActivityMetrics.get(session.userId);
    if (userMetrics) {
      userMetrics.sessionCount++;
    }
  }

  private _endSession(sessionId: string, userId: string, sessionDurationMs: number): void {
    const session = this._activeSessions.get(sessionId);
    if (session) {
      this._activeSessions.delete(sessionId);
    }

    const userMetrics = this._userActivityMetrics.get(userId);
    if (userMetrics) {
      userMetrics.totalSessionDurationMs += sessionDurationMs;
    }
  }

  private _incrementEventCount(type: AuditEventType): void {
    const current = this._eventCounts.get(type) ?? 0;
    this._eventCounts.set(type, current + 1);
  }

  private _incrementErrorCount(type: AuditEventType): void {
    const current = this._errorCounts.get(type) ?? 0;
    this._errorCounts.set(type, current + 1);
  }

  private _recordProcessingTime(time: number): void {
    this._processingTimes.push(time);
    if (this._processingTimes.length > 1000) {
      this._processingTimes.shift();
    }
  }

  private _startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const sessionTimeoutMs = 24 * 60 * 60 * 1000;
      for (const [sessionId, session] of this._activeSessions) {
        const sessionRecord = session as unknown as Record<string, unknown>;
        const lastActivityAt = sessionRecord['lastActivityAt'];
        if (typeof lastActivityAt === 'number' && now - lastActivityAt > sessionTimeoutMs) {
          this._activeSessions.delete(sessionId);
        }
      }
    }, 60000);
  }
}
