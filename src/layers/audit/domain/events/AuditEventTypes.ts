/**
 * Audit Event Types
 *
 * Defines all event types specific to the Audit layer.
 * Each event type has a specific payload structure for type safety.
 */

export enum AuditEventType {
  ACCESS_GRANTED = 'audit.access_granted',
  ACCESS_DENIED = 'audit.access_denied',
  RESOURCE_CREATED = 'audit.resource_created',
  RESOURCE_UPDATED = 'audit.resource_updated',
  RESOURCE_DELETED = 'audit.resource_deleted',
  RESOURCE_ACCESSED = 'audit.resource_accessed',
  PERMISSION_CHANGED = 'audit.permission_changed',
  ROLE_ASSIGNED = 'audit.role_assigned',
  ROLE_REVOKED = 'audit.role_revoked',
  POLICY_CREATED = 'audit.policy_created',
  POLICY_UPDATED = 'audit.policy_updated',
  POLICY_DELETED = 'audit.policy_deleted',
  DATA_EXPORTED = 'audit.data_exported',
  DATA_IMPORTED = 'audit.data_imported',
  CONFIG_CHANGED = 'audit.config_changed',
  SECURITY_EVENT = 'audit.security_event',
  COMPLIANCE_CHECK = 'audit.compliance_check',
  SESSION_STARTED = 'audit.session_started',
  SESSION_ENDED = 'audit.session_ended',
  LOGIN_SUCCESS = 'audit.login_success',
  LOGIN_FAILED = 'audit.login_failed',
  LOGOUT = 'audit.logout',
  PASSWORD_CHANGED = 'audit.password_changed',
  MFA_ENABLED = 'audit.mfa_enabled',
  MFA_DISABLED = 'audit.mfa_disabled',
  API_KEY_CREATED = 'audit.api_key_created',
  API_KEY_REVOKED = 'audit.api_key_revoked',
  CUSTOM_EVENT = 'audit.custom_event',
}

export interface AccessGrantedPayload {
  resourceId: string;
  resourceType: string;
  action: string;
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  grantedBy?: string;
  reason?: string;
}

export interface AccessDeniedPayload {
  resourceId: string;
  resourceType: string;
  action: string;
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  reason:
    | 'insufficient_permissions'
    | 'resource_not_found'
    | 'policy_denied'
    | 'rate_limited'
    | 'expired_token'
    | 'invalid_token'
    | 'mfa_required'
    | 'account_locked'
    | 'other';
  attemptedAt: number;
}

export interface ResourceChangedPayload {
  resourceId: string;
  resourceType: string;
  operation: 'created' | 'updated' | 'deleted';
  userId: string;
  sessionId?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface ResourceAccessedPayload {
  resourceId: string;
  resourceType: string;
  action: 'read' | 'list' | 'search' | 'export';
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  queryParams?: Record<string, unknown>;
  resultCount?: number;
}

export interface PermissionChangedPayload {
  targetUserId: string;
  permission: string;
  resourceId?: string;
  resourceType?: string;
  action: 'granted' | 'revoked' | 'modified';
  changedBy: string;
  sessionId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export interface RoleChangedPayload {
  targetUserId: string;
  roleId: string;
  roleName: string;
  action: 'assigned' | 'revoked';
  changedBy: string;
  sessionId?: string;
  scope?: string;
  expiresAt?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface PolicyChangedPayload {
  policyId: string;
  policyName: string;
  operation: 'created' | 'updated' | 'deleted';
  changedBy: string;
  sessionId?: string;
  rules?: Record<string, unknown>;
  previousRules?: Record<string, unknown>;
  newRules?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface DataTransferPayload {
  resourceType: string;
  operation: 'exported' | 'imported';
  userId: string;
  sessionId?: string;
  recordCount: number;
  fileSize?: number;
  format?: string;
  destination?: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
  encryptionUsed?: boolean;
}

export interface ConfigChangedPayload {
  configKey: string;
  configSection: string;
  operation: 'created' | 'updated' | 'deleted';
  changedBy: string;
  sessionId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requiresRestart?: boolean;
}

export interface SecurityEventPayload {
  eventType:
    | 'brute_force'
    | 'suspicious_activity'
    | 'anomaly_detected'
    | 'threat_detected'
    | 'vulnerability_found'
    | 'intrusion_attempt'
    | 'data_leak'
    | 'privilege_escalation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, unknown>;
  detectedAt: number;
  source: string;
  mitigated?: boolean;
  mitigationActions?: string[];
}

export interface ComplianceCheckPayload {
  framework: 'gdpr' | 'hipaa' | 'pci_dss' | 'sox' | 'iso27001' | 'nist' | 'custom';
  checkId: string;
  checkName: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  resourceId?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  remediation?: string;
  checkedAt: number;
  checkedBy: string;
}

export interface SessionPayload {
  sessionId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  authMethod: 'password' | 'mfa' | 'sso' | 'api_key' | 'oauth2' | 'certificate';
  mfaUsed?: boolean;
  deviceFingerprint?: string;
  location?: { country?: string; region?: string; city?: string };
}

export interface LoginPayload {
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  authMethod: 'password' | 'mfa' | 'sso' | 'api_key' | 'oauth2' | 'certificate';
  mfaUsed?: boolean;
  deviceFingerprint?: string;
  location?: { country?: string; region?: string; city?: string };
  failureReason?: 'invalid_credentials' | 'account_locked' | 'mfa_failed' | 'expired_password' | 'ip_blocked' | 'other';
}

export interface LogoutPayload {
  userId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  reason: 'user_initiated' | 'timeout' | 'admin_revoked' | 'security_event' | 'password_changed' | 'mfa_revoked';
  sessionDurationMs: number;
}

export interface CredentialChangedPayload {
  userId: string;
  credentialType: 'password' | 'mfa' | 'api_key' | 'ssh_key' | 'certificate';
  operation: 'changed' | 'reset' | 'rotated' | 'revoked';
  changedBy: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export interface ApiKeyPayload {
  keyId: string;
  keyName: string;
  userId: string;
  operation: 'created' | 'revoked' | 'rotated' | 'expired';
  scopes: string[];
  expiresAt?: number;
  lastUsedAt?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface CustomEventPayload {
  eventName: string;
  payload: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}

export type AuditEventPayload =
  | AccessGrantedPayload
  | AccessDeniedPayload
  | ResourceChangedPayload
  | ResourceAccessedPayload
  | PermissionChangedPayload
  | RoleChangedPayload
  | PolicyChangedPayload
  | DataTransferPayload
  | ConfigChangedPayload
  | SecurityEventPayload
  | ComplianceCheckPayload
  | SessionPayload
  | LoginPayload
  | LogoutPayload
  | CredentialChangedPayload
  | ApiKeyPayload
  | CustomEventPayload;

export interface AuditDomainEvent<T extends AuditEventType = AuditEventType> {
  type: T;
  payload: AuditEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}
