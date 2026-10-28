/**
 * Authorization Event Processor
 *
 * Real business logic for processing Authorization events.
 * Handles permission checks, role management, policy evaluation, caching, and metrics.
 */

import { IAuthorization } from '../../interfaces/IAuthorization';
import {
  AuthorizationEventType,
  AuthorizationDomainEvent,
  AuthorizationEventPayload,
  PermissionCheckPayload,
  PermissionResultPayload,
  RoleChangedPayload,
  PolicyChangedPayload,
  ResourceAccessPayload,
  SubjectChangedPayload,
  DelegationPayload,
  ConditionEvaluatedPayload,
  CacheEventPayload,
  CustomEventPayload,
} from '../events/AuthorizationEventTypes';

export interface AuthorizationProcessorConfig {
  enableValidation: boolean;
  enableEnrichment: boolean;
  enablePermissionTracking: boolean;
  enableRoleTracking: boolean;
  enablePolicyTracking: boolean;
  enableResourceTracking: boolean;
  enableSubjectTracking: boolean;
  enableDelegationTracking: boolean;
  enableConditionTracking: boolean;
  enableCacheTracking: boolean;
  maxEventSize: number;
  allowedEventTypes: AuthorizationEventType[];
  piiFields: string[];
}

export interface EnrichedEvent extends AuthorizationDomainEvent {
  enriched: boolean;
  subjectId?: string;
  resourceId?: string;
  resourceType?: string;
  action?: string;
  allowed?: boolean;
  roleId?: string;
  policyId?: string;
  processingTimeMs: number;
}

export interface PermissionMetrics {
  action: string;
  resourceType: string;
  totalChecks: number;
  grantedCount: number;
  deniedCount: number;
  avgEvaluationTimeMs: number;
  uniqueSubjects: Set<string>;
  uniqueResources: Set<string>;
  lastCheckAt: number;
}

export interface RoleMetrics {
  roleId: string;
  roleName: string;
  assignedCount: number;
  revokedCount: number;
  uniqueSubjects: Set<string>;
  lastChangeAt: number;
}

export interface PolicyMetrics {
  policyId: string;
  policyName: string;
  evaluations: number;
  allowCount: number;
  denyCount: number;
  avgEvaluationTimeMs: number;
  lastEvaluatedAt: number;
}

export interface ResourceMetrics {
  resourceId: string;
  resourceType: string;
  accessRequests: number;
  grantedCount: number;
  deniedCount: number;
  uniqueSubjects: Set<string>;
  lastAccessAt: number;
}

export interface SubjectMetrics {
  subjectId: string;
  subjectType: string;
  permissionChecks: number;
  rolesAssigned: number;
  rolesRevoked: number;
  delegationsGranted: number;
  delegationsRevoked: number;
  lastActivityAt: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  hitRate: number;
  avgLatencyMs: number;
}

export class AuthorizationEventProcessor {
  private _config: AuthorizationProcessorConfig;
  private _adapters: Map<string, IAuthorization>;
  private _permissionMetrics: Map<string, PermissionMetrics>;
  private _roleMetrics: Map<string, RoleMetrics>;
  private _policyMetrics: Map<string, PolicyMetrics>;
  private _resourceMetrics: Map<string, ResourceMetrics>;
  private _subjectMetrics: Map<string, SubjectMetrics>;
  private _cacheMetrics: CacheMetrics;
  private _eventCounts: Map<string, number>;
  private _errorCounts: Map<string, number>;
  private _processingTimes: number[];
  private _startTime: number;

  constructor(config: Partial<AuthorizationProcessorConfig> = {}) {
    this._config = {
      enableValidation: true,
      enableEnrichment: true,
      enablePermissionTracking: true,
      enableRoleTracking: true,
      enablePolicyTracking: true,
      enableResourceTracking: true,
      enableSubjectTracking: true,
      enableDelegationTracking: true,
      enableConditionTracking: true,
      enableCacheTracking: true,
      maxEventSize: 1024 * 1024,
      allowedEventTypes: Object.values(AuthorizationEventType),
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
      ...config,
    };

    this._adapters = new Map();
    this._permissionMetrics = new Map();
    this._roleMetrics = new Map();
    this._policyMetrics = new Map();
    this._resourceMetrics = new Map();
    this._subjectMetrics = new Map();
    this._cacheMetrics = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      hitRate: 0,
      avgLatencyMs: 0,
    };
    this._eventCounts = new Map();
    this._errorCounts = new Map();
    this._processingTimes = [];
    this._startTime = Date.now();
  }

  registerAdapter(name: string, adapter: IAuthorization): void {
    this._adapters.set(name, adapter);
  }

  unregisterAdapter(name: string): void {
    this._adapters.delete(name);
  }

  async processEvent(event: AuthorizationDomainEvent): Promise<EnrichedEvent> {
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

  async processBatch(events: AuthorizationDomainEvent[]): Promise<EnrichedEvent[]> {
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

  getPermissionMetrics(action: string, resourceType: string): PermissionMetrics | undefined {
    return this._permissionMetrics.get(`${action}:${resourceType}`);
  }

  getAllPermissionMetrics(): PermissionMetrics[] {
    return Array.from(this._permissionMetrics.values());
  }

  getRoleMetrics(roleId: string): RoleMetrics | undefined {
    return this._roleMetrics.get(roleId);
  }

  getAllRoleMetrics(): RoleMetrics[] {
    return Array.from(this._roleMetrics.values());
  }

  getPolicyMetrics(policyId: string): PolicyMetrics | undefined {
    return this._policyMetrics.get(policyId);
  }

  getAllPolicyMetrics(): PolicyMetrics[] {
    return Array.from(this._policyMetrics.values());
  }

  getResourceMetrics(resourceId: string, resourceType: string): ResourceMetrics | undefined {
    return this._resourceMetrics.get(`${resourceType}:${resourceId}`);
  }

  getAllResourceMetrics(): ResourceMetrics[] {
    return Array.from(this._resourceMetrics.values());
  }

  getSubjectMetrics(subjectId: string): SubjectMetrics | undefined {
    return this._subjectMetrics.get(subjectId);
  }

  getAllSubjectMetrics(): SubjectMetrics[] {
    return Array.from(this._subjectMetrics.values());
  }

  getCacheMetrics(): CacheMetrics {
    return { ...this._cacheMetrics };
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

  private _validateEvent(event: AuthorizationDomainEvent): AuthorizationDomainEvent {
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

  private _sanitizePii(payload: AuthorizationEventPayload): void {
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

  private _enrichEvent(event: AuthorizationDomainEvent): EnrichedEvent {
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
      case AuthorizationEventType.PERMISSION_CHECK: {
        const check = payload as PermissionCheckPayload;
        enriched.subjectId = check.subjectId;
        enriched.resourceId = check.resourceId;
        enriched.resourceType = check.resourceType;
        enriched.action = check.action;
        break;
      }
      case AuthorizationEventType.PERMISSION_GRANTED:
      case AuthorizationEventType.PERMISSION_DENIED: {
        const result = payload as PermissionResultPayload;
        enriched.subjectId = result.subjectId;
        enriched.resourceId = result.resourceId;
        enriched.resourceType = result.resourceType;
        enriched.action = result.action;
        enriched.allowed = result.allowed;
        break;
      }
      case AuthorizationEventType.ROLE_ASSIGNED:
      case AuthorizationEventType.ROLE_REVOKED:
      case AuthorizationEventType.ROLE_CREATED:
      case AuthorizationEventType.ROLE_UPDATED:
      case AuthorizationEventType.ROLE_DELETED: {
        const role = payload as RoleChangedPayload;
        enriched.subjectId = role.subjectId;
        enriched.roleId = role.roleId;
        break;
      }
      case AuthorizationEventType.POLICY_CREATED:
      case AuthorizationEventType.POLICY_UPDATED:
      case AuthorizationEventType.POLICY_DELETED:
      case AuthorizationEventType.POLICY_EVALUATED: {
        const policy = payload as PolicyChangedPayload;
        enriched.policyId = policy.policyId;
        break;
      }
      case AuthorizationEventType.RESOURCE_ACCESS_REQUESTED:
      case AuthorizationEventType.RESOURCE_ACCESS_GRANTED:
      case AuthorizationEventType.RESOURCE_ACCESS_DENIED: {
        const access = payload as ResourceAccessPayload;
        enriched.subjectId = access.subjectId;
        enriched.resourceId = access.resourceId;
        enriched.resourceType = access.resourceType;
        enriched.action = access.action;
        enriched.allowed = access.allowed;
        break;
      }
      case AuthorizationEventType.SUBJECT_CREATED:
      case AuthorizationEventType.SUBJECT_UPDATED:
      case AuthorizationEventType.SUBJECT_DELETED: {
        const subject = payload as SubjectChangedPayload;
        enriched.subjectId = subject.subjectId;
        break;
      }
      case AuthorizationEventType.DELEGATION_GRANTED:
      case AuthorizationEventType.DELEGATION_REVOKED: {
        const delegation = payload as DelegationPayload;
        enriched.subjectId = delegation.delegatorId;
        enriched.resourceId = delegation.resourceId;
        enriched.resourceType = delegation.resourceType;
        break;
      }
      case AuthorizationEventType.CONDITION_EVALUATED: {
        const condition = payload as ConditionEvaluatedPayload;
        enriched.subjectId = condition.subjectId;
        enriched.resourceId = condition.resourceId;
        enriched.action = condition.action;
        break;
      }
      case AuthorizationEventType.CACHE_HIT:
      case AuthorizationEventType.CACHE_MISS:
      case AuthorizationEventType.CACHE_INVALIDATED: {
        const cache = payload as CacheEventPayload;
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
        subjectId: event.subjectId,
        resourceId: event.resourceId,
        resourceType: event.resourceType,
        action: event.action,
        allowed: event.allowed,
        roleId: event.roleId,
        policyId: event.policyId,
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
    this._incrementEventCount(event.type);

    switch (event.type) {
      case AuthorizationEventType.PERMISSION_CHECK: {
        if (this._config.enablePermissionTracking) {
          const check = event.payload as PermissionCheckPayload;
          this._updatePermissionMetrics(check.action, check.resourceType, check.subjectId, check.resourceId);
        }
        break;
      }
      case AuthorizationEventType.PERMISSION_GRANTED: {
        if (this._config.enablePermissionTracking) {
          const result = event.payload as PermissionResultPayload;
          this._updatePermissionMetrics(result.action, result.resourceType, result.subjectId, result.resourceId, true);
          this._updateResourceMetrics(result.resourceId, result.resourceType, result.subjectId, true);
          this._updateSubjectMetrics(result.subjectId, 'permission_granted');
        }
        break;
      }
      case AuthorizationEventType.PERMISSION_DENIED: {
        if (this._config.enablePermissionTracking) {
          const result = event.payload as PermissionResultPayload;
          this._updatePermissionMetrics(result.action, result.resourceType, result.subjectId, result.resourceId, false);
          this._updateResourceMetrics(result.resourceId, result.resourceType, result.subjectId, false);
          this._updateSubjectMetrics(result.subjectId, 'permission_denied');
        }
        break;
      }
      case AuthorizationEventType.ROLE_ASSIGNED: {
        if (this._config.enableRoleTracking) {
          const role = event.payload as RoleChangedPayload;
          this._updateRoleMetrics(role.roleId, role.roleName, role.subjectId, true);
          this._updateSubjectMetrics(role.subjectId, 'role_assigned');
        }
        break;
      }
      case AuthorizationEventType.ROLE_REVOKED: {
        if (this._config.enableRoleTracking) {
          const role = event.payload as RoleChangedPayload;
          this._updateRoleMetrics(role.roleId, role.roleName, role.subjectId, false);
          this._updateSubjectMetrics(role.subjectId, 'role_revoked');
        }
        break;
      }
      case AuthorizationEventType.ROLE_CREATED:
      case AuthorizationEventType.ROLE_UPDATED:
      case AuthorizationEventType.ROLE_DELETED: {
        if (this._config.enableRoleTracking) {
          const role = event.payload as RoleChangedPayload;
          this._updateRoleMetrics(role.roleId, role.roleName, role.subjectId, role.action === 'assigned');
        }
        break;
      }
      case AuthorizationEventType.POLICY_EVALUATED: {
        if (this._config.enablePolicyTracking) {
          const policy = event.payload as PolicyChangedPayload;
          this._updatePolicyMetrics(policy.policyId, policy.policyName, policy.effect === 'allow');
        }
        break;
      }
      case AuthorizationEventType.POLICY_CREATED:
      case AuthorizationEventType.POLICY_UPDATED:
      case AuthorizationEventType.POLICY_DELETED: {
        if (this._config.enablePolicyTracking) {
          const policy = event.payload as PolicyChangedPayload;
          this._updatePolicyMetrics(policy.policyId, policy.policyName, undefined);
        }
        break;
      }
      case AuthorizationEventType.RESOURCE_ACCESS_REQUESTED:
      case AuthorizationEventType.RESOURCE_ACCESS_GRANTED:
      case AuthorizationEventType.RESOURCE_ACCESS_DENIED: {
        if (this._config.enableResourceTracking) {
          const access = event.payload as ResourceAccessPayload;
          this._updateResourceMetrics(access.resourceId, access.resourceType, access.subjectId, access.allowed);
        }
        break;
      }
      case AuthorizationEventType.SUBJECT_CREATED:
      case AuthorizationEventType.SUBJECT_UPDATED:
      case AuthorizationEventType.SUBJECT_DELETED: {
        if (this._config.enableSubjectTracking) {
          const subject = event.payload as SubjectChangedPayload;
          const activityMap: Record<string, 'permission_granted' | 'permission_denied' | 'role_assigned' | 'role_revoked' | 'delegation_granted' | 'delegation_revoked' | 'condition_evaluated' | 'permission_checked'> = {
            created: 'permission_checked',
            updated: 'permission_checked',
            deleted: 'permission_checked',
          };
          this._updateSubjectMetrics(subject.subjectId, activityMap[subject.operation] ?? 'permission_checked');
        }
        break;
      }
      case AuthorizationEventType.DELEGATION_GRANTED:
      case AuthorizationEventType.DELEGATION_REVOKED: {
        if (this._config.enableDelegationTracking) {
          const delegation = event.payload as DelegationPayload;
          this._updateSubjectMetrics(delegation.delegatorId, delegation.action === 'granted' ? 'delegation_granted' : 'delegation_revoked');
          this._updateSubjectMetrics(delegation.delegateeId, delegation.action === 'granted' ? 'delegation_granted' : 'delegation_revoked');
        }
        break;
      }
      case AuthorizationEventType.CONDITION_EVALUATED: {
        if (this._config.enableConditionTracking) {
          const condition = event.payload as ConditionEvaluatedPayload;
          this._updateSubjectMetrics(condition.subjectId, 'condition_evaluated');
        }
        break;
      }
      case AuthorizationEventType.CACHE_HIT: {
        if (this._config.enableCacheTracking) {
          this._cacheMetrics.hits++;
          this._updateCacheHitRate();
        }
        break;
      }
      case AuthorizationEventType.CACHE_MISS: {
        if (this._config.enableCacheTracking) {
          this._cacheMetrics.misses++;
          this._updateCacheHitRate();
        }
        break;
      }
      case AuthorizationEventType.CACHE_INVALIDATED: {
        if (this._config.enableCacheTracking) {
          this._cacheMetrics.invalidations++;
        }
        break;
      }
    }
  }

  private _updatePermissionMetrics(
    action: string,
    resourceType: string,
    subjectId: string,
    resourceId: string,
    allowed?: boolean
  ): void {
    const key = `${action}:${resourceType}`;
    let metrics = this._permissionMetrics.get(key);
    if (!metrics) {
      metrics = {
        action,
        resourceType,
        totalChecks: 0,
        grantedCount: 0,
        deniedCount: 0,
        avgEvaluationTimeMs: 0,
        uniqueSubjects: new Set(),
        uniqueResources: new Set(),
        lastCheckAt: 0,
      };
      this._permissionMetrics.set(key, metrics);
    }

    metrics.totalChecks++;
    if (allowed === true) metrics.grantedCount++;
    else if (allowed === false) metrics.deniedCount++;
    metrics.uniqueSubjects.add(subjectId);
    metrics.uniqueResources.add(resourceId);
    metrics.lastCheckAt = Date.now();
  }

  private _updateRoleMetrics(roleId: string, roleName: string, subjectId: string, assigned: boolean): void {
    let metrics = this._roleMetrics.get(roleId);
    if (!metrics) {
      metrics = {
        roleId,
        roleName,
        assignedCount: 0,
        revokedCount: 0,
        uniqueSubjects: new Set(),
        lastChangeAt: 0,
      };
      this._roleMetrics.set(roleId, metrics);
    }

    if (assigned) metrics.assignedCount++;
    else metrics.revokedCount++;
    metrics.uniqueSubjects.add(subjectId);
    metrics.lastChangeAt = Date.now();
  }

  private _updatePolicyMetrics(policyId: string, policyName: string, allowed?: boolean): void {
    let metrics = this._policyMetrics.get(policyId);
    if (!metrics) {
      metrics = {
        policyId,
        policyName,
        evaluations: 0,
        allowCount: 0,
        denyCount: 0,
        avgEvaluationTimeMs: 0,
        lastEvaluatedAt: 0,
      };
      this._policyMetrics.set(policyId, metrics);
    }

    metrics.evaluations++;
    if (allowed === true) metrics.allowCount++;
    else if (allowed === false) metrics.denyCount++;
    metrics.lastEvaluatedAt = Date.now();
  }

  private _updateResourceMetrics(resourceId: string, resourceType: string, subjectId: string, allowed?: boolean): void {
    const key = `${resourceType}:${resourceId}`;
    let metrics = this._resourceMetrics.get(key);
    if (!metrics) {
      metrics = {
        resourceId,
        resourceType,
        accessRequests: 0,
        grantedCount: 0,
        deniedCount: 0,
        uniqueSubjects: new Set(),
        lastAccessAt: 0,
      };
      this._resourceMetrics.set(key, metrics);
    }

    metrics.accessRequests++;
    if (allowed === true) metrics.grantedCount++;
    else if (allowed === false) metrics.deniedCount++;
    metrics.uniqueSubjects.add(subjectId);
    metrics.lastAccessAt = Date.now();
  }

  private _updateSubjectMetrics(
    subjectId: string,
    activity:
      | 'permission_granted'
      | 'permission_denied'
      | 'role_assigned'
      | 'role_revoked'
      | 'delegation_granted'
      | 'delegation_revoked'
      | 'condition_evaluated'
      | 'permission_checked'
  ): void {
    let metrics = this._subjectMetrics.get(subjectId);
    if (!metrics) {
      metrics = {
        subjectId,
        subjectType: 'unknown',
        permissionChecks: 0,
        rolesAssigned: 0,
        rolesRevoked: 0,
        delegationsGranted: 0,
        delegationsRevoked: 0,
        lastActivityAt: 0,
      };
      this._subjectMetrics.set(subjectId, metrics);
    }

    metrics.permissionChecks++;
    switch (activity) {
      case 'role_assigned':
        metrics.rolesAssigned++;
        break;
      case 'role_revoked':
        metrics.rolesRevoked++;
        break;
      case 'delegation_granted':
        metrics.delegationsGranted++;
        break;
      case 'delegation_revoked':
        metrics.delegationsRevoked++;
        break;
    }
    metrics.lastActivityAt = Date.now();
  }

  private _updateCacheHitRate(): void {
    const total = this._cacheMetrics.hits + this._cacheMetrics.misses;
    this._cacheMetrics.hitRate = total > 0 ? this._cacheMetrics.hits / total : 0;
  }

  private _incrementEventCount(type: AuthorizationEventType): void {
    const current = this._eventCounts.get(type) ?? 0;
    this._eventCounts.set(type, current + 1);
  }

  private _incrementErrorCount(type: AuthorizationEventType): void {
    const current = this._errorCounts.get(type) ?? 0;
    this._errorCounts.set(type, current + 1);
  }

  private _recordProcessingTime(time: number): void {
    this._processingTimes.push(time);
    if (this._processingTimes.length > 1000) {
      this._processingTimes.shift();
    }
  }
}
