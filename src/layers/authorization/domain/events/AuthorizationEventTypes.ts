/**
 * Authorization Event Types
 *
 * Defines all event types specific to the Authorization layer.
 * Each event type has a specific payload structure for type safety.
 */

export enum AuthorizationEventType {
  PERMISSION_CHECK = 'authorization.permission_check',
  PERMISSION_GRANTED = 'authorization.permission_granted',
  PERMISSION_DENIED = 'authorization.permission_denied',
  ROLE_ASSIGNED = 'authorization.role_assigned',
  ROLE_REVOKED = 'authorization.role_revoked',
  ROLE_CREATED = 'authorization.role_created',
  ROLE_UPDATED = 'authorization.role_updated',
  ROLE_DELETED = 'authorization.role_deleted',
  POLICY_EVALUATED = 'authorization.policy_evaluated',
  POLICY_CREATED = 'authorization.policy_created',
  POLICY_UPDATED = 'authorization.policy_updated',
  POLICY_DELETED = 'authorization.policy_deleted',
  RESOURCE_ACCESS_REQUESTED = 'authorization.resource_access_requested',
  RESOURCE_ACCESS_GRANTED = 'authorization.resource_access_granted',
  RESOURCE_ACCESS_DENIED = 'authorization.resource_access_denied',
  SUBJECT_CREATED = 'authorization.subject_created',
  SUBJECT_UPDATED = 'authorization.subject_updated',
  SUBJECT_DELETED = 'authorization.subject_deleted',
  DELEGATION_GRANTED = 'authorization.delegation_granted',
  DELEGATION_REVOKED = 'authorization.delegation_revoked',
  CONDITION_EVALUATED = 'authorization.condition_evaluated',
  CACHE_HIT = 'authorization.cache_hit',
  CACHE_MISS = 'authorization.cache_miss',
  CACHE_INVALIDATED = 'authorization.cache_invalidated',
  CUSTOM_EVENT = 'authorization.custom_event',
}

export interface PermissionCheckPayload {
  subjectId: string;
  resourceId: string;
  resourceType: string;
  action: string;
  context?: Record<string, unknown>;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PermissionResultPayload {
  subjectId: string;
  resourceId: string;
  resourceType: string;
  action: string;
  allowed: boolean;
  reason?: string;
  matchedPolicies?: string[];
  evaluationTimeMs: number;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RoleChangedPayload {
  subjectId: string;
  roleId: string;
  roleName: string;
  action: 'assigned' | 'revoked' | 'created' | 'updated' | 'deleted';
  grantedBy: string;
  sessionId?: string;
  scope?: string;
  expiresAt?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface PolicyChangedPayload {
  policyId: string;
  policyName: string;
  operation: 'created' | 'updated' | 'deleted' | 'evaluated';
  changedBy: string;
  sessionId?: string;
  rules?: Record<string, unknown>;
  previousRules?: Record<string, unknown>;
  newRules?: Record<string, unknown>;
  effect?: 'allow' | 'deny';
  ipAddress?: string;
  userAgent?: string;
}

export interface ResourceAccessPayload {
  subjectId: string;
  resourceId: string;
  resourceType: string;
  action: string;
  context?: Record<string, unknown>;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  allowed: boolean;
  reason?: string;
  matchedPolicies?: string[];
}

export interface SubjectChangedPayload {
  subjectId: string;
  subjectType: 'user' | 'service' | 'group' | 'device';
  operation: 'created' | 'updated' | 'deleted';
  changedBy: string;
  sessionId?: string;
  attributes?: Record<string, unknown>;
  previousAttributes?: Record<string, unknown>;
  newAttributes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface DelegationPayload {
  delegatorId: string;
  delegateeId: string;
  resourceId: string;
  resourceType: string;
  actions: string[];
  action: 'granted' | 'revoked';
  grantedBy: string;
  sessionId?: string;
  expiresAt?: number;
  constraints?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConditionEvaluatedPayload {
  conditionId: string;
  conditionType: 'time' | 'ip' | 'attribute' | 'context' | 'custom';
  subjectId: string;
  resourceId: string;
  action: string;
  result: boolean;
  evaluationTimeMs: number;
  context?: Record<string, unknown>;
}

export interface CacheEventPayload {
  cacheKey: string;
  operation: 'hit' | 'miss' | 'invalidate' | 'set' | 'delete';
  subjectId?: string;
  resourceId?: string;
  action?: string;
  ttl?: number;
  size?: number;
}

export interface CustomEventPayload {
  eventName: string;
  payload: Record<string, unknown>;
  subjectId?: string;
  resourceId?: string;
}

export type AuthorizationEventPayload =
  | PermissionCheckPayload
  | PermissionResultPayload
  | RoleChangedPayload
  | PolicyChangedPayload
  | ResourceAccessPayload
  | SubjectChangedPayload
  | DelegationPayload
  | ConditionEvaluatedPayload
  | CacheEventPayload
  | CustomEventPayload;

export interface AuthorizationDomainEvent<T extends AuthorizationEventType = AuthorizationEventType> {
  type: T;
  payload: AuthorizationEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}
