/**
 * Audit Event Processor Tests
 */

import { AuditEventProcessor } from '../domain/handlers/AuditEventProcessor';
import { FileAuditAdapter } from '../adapters/FileAuditAdapter';
import {
  AuditEventType,
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
} from '../domain/events/AuditEventTypes';

describe('AuditEventProcessor', () => {
  let processor: AuditEventProcessor;
  let adapter: FileAuditAdapter;

  beforeEach(() => {
    processor = new AuditEventProcessor({
      enableValidation: true,
      enableEnrichment: true,
      enableAccessTracking: true,
      enableResourceTracking: true,
      enableSecurityTracking: true,
      enableComplianceTracking: true,
      enableSessionTracking: true,
      enableCredentialTracking: true,
    });
    adapter = new FileAuditAdapter();
    processor.registerAdapter('file', adapter);
  });

  afterEach(async () => {
    adapter.clear();
  });

  describe('processEvent', () => {
    it('should process an access granted event', async () => {
      const event = {
        type: AuditEventType.ACCESS_GRANTED,
        payload: {
          resourceId: 'resource_123',
          resourceType: 'document',
          action: 'read',
          userId: 'user_456',
          sessionId: 'session_789',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          grantedBy: 'admin_1',
          reason: 'policy_allow',
        } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_123',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.ACCESS_GRANTED);
      expect(result.userId).toBe('user_456');
      expect(result.sessionId).toBe('session_789');
      expect(result.resourceId).toBe('resource_123');
      expect(result.resourceType).toBe('document');
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should process an access denied event', async () => {
      const event = {
        type: AuditEventType.ACCESS_DENIED,
        payload: {
          resourceId: 'resource_123',
          resourceType: 'document',
          action: 'delete',
          userId: 'user_456',
          sessionId: 'session_789',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          reason: 'insufficient_permissions',
          attemptedAt: Date.now(),
        } as AccessDeniedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_124',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.ACCESS_DENIED);
      expect(result.userId).toBe('user_456');
      expect(result.resourceId).toBe('resource_123');
      expect(result.resourceType).toBe('document');
      expect(result.ipAddress).toBe('192.168.1.1');
    });

    it('should process a resource created event', async () => {
      const event = {
        type: AuditEventType.RESOURCE_CREATED,
        payload: {
          resourceId: 'resource_456',
          resourceType: 'user',
          operation: 'created',
          userId: 'admin_1',
          sessionId: 'session_123',
          changes: { name: { old: undefined, new: 'John' }, email: { old: undefined, new: 'john@example.com' } },
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as ResourceChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_125',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.RESOURCE_CREATED);
      expect(result.userId).toBe('admin_1');
      expect(result.resourceId).toBe('resource_456');
      expect(result.resourceType).toBe('user');
      expect(result.ipAddress).toBe('10.0.0.1');
    });

    it('should process a resource updated event', async () => {
      const event = {
        type: AuditEventType.RESOURCE_UPDATED,
        payload: {
          resourceId: 'resource_456',
          resourceType: 'user',
          operation: 'updated',
          userId: 'admin_1',
          sessionId: 'session_123',
          changes: { email: { old: 'john@example.com', new: 'john.doe@example.com' } },
          previousState: { email: 'john@example.com' },
          newState: { email: 'john.doe@example.com' },
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as ResourceChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_126',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.RESOURCE_UPDATED);
      expect(result.userId).toBe('admin_1');
      expect(result.resourceId).toBe('resource_456');
    });

    it('should process a resource deleted event', async () => {
      const event = {
        type: AuditEventType.RESOURCE_DELETED,
        payload: {
          resourceId: 'resource_456',
          resourceType: 'user',
          operation: 'deleted',
          userId: 'admin_1',
          sessionId: 'session_123',
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as ResourceChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_127',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.RESOURCE_DELETED);
      expect(result.userId).toBe('admin_1');
      expect(result.resourceId).toBe('resource_456');
    });

    it('should process a resource accessed event', async () => {
      const event = {
        type: AuditEventType.RESOURCE_ACCESSED,
        payload: {
          resourceId: 'resource_789',
          resourceType: 'report',
          action: 'read',
          userId: 'user_111',
          sessionId: 'session_222',
          ipAddress: '192.168.1.50',
          userAgent: 'browser',
          queryParams: { format: 'pdf' },
          resultCount: 1,
        } as ResourceAccessedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_128',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.RESOURCE_ACCESSED);
      expect(result.userId).toBe('user_111');
      expect(result.resourceId).toBe('resource_789');
      expect(result.resourceType).toBe('report');
    });

    it('should process a permission changed event', async () => {
      const event = {
        type: AuditEventType.PERMISSION_CHANGED,
        payload: {
          targetUserId: 'user_999',
          permission: 'document:write',
          resourceId: 'resource_123',
          resourceType: 'document',
          action: 'granted',
          changedBy: 'admin_1',
          sessionId: 'session_321',
          previousValue: false,
          newValue: true,
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as PermissionChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_129',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.PERMISSION_CHANGED);
      expect(result.userId).toBe('user_999');
      expect(result.resourceId).toBe('resource_123');
    });

    it('should process a role assigned event', async () => {
      const event = {
        type: AuditEventType.ROLE_ASSIGNED,
        payload: {
          targetUserId: 'user_999',
          roleId: 'role_editor',
          roleName: 'Editor',
          action: 'assigned',
          changedBy: 'admin_1',
          sessionId: 'session_321',
          scope: 'project_123',
          expiresAt: Date.now() + 86400000,
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_130',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.ROLE_ASSIGNED);
      expect(result.userId).toBe('user_999');
      expect(result.ipAddress).toBe('10.0.0.1');
    });

    it('should process a policy created event', async () => {
      const event = {
        type: AuditEventType.POLICY_CREATED,
        payload: {
          policyId: 'policy_123',
          policyName: 'Document Access Policy',
          operation: 'created',
          changedBy: 'admin_1',
          sessionId: 'session_321',
          rules: { document: { read: true, write: false } },
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as PolicyChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_131',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.POLICY_CREATED);
      expect(result.userId).toBe('admin_1');
    });

    it('should process a data exported event', async () => {
      const event = {
        type: AuditEventType.DATA_EXPORTED,
        payload: {
          resourceType: 'user',
          operation: 'exported',
          userId: 'admin_1',
          sessionId: 'session_321',
          recordCount: 1000,
          fileSize: 5242880,
          format: 'csv',
          destination: 's3://bucket/export.csv',
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
          encryptionUsed: true,
        } as DataTransferPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_132',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.DATA_EXPORTED);
      expect(result.userId).toBe('admin_1');
    });

    it('should process a config changed event', async () => {
      const event = {
        type: AuditEventType.CONFIG_CHANGED,
        payload: {
          configKey: 'max_login_attempts',
          configSection: 'security',
          operation: 'updated',
          changedBy: 'admin_1',
          sessionId: 'session_321',
          previousValue: 5,
          newValue: 3,
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
          requiresRestart: false,
        } as ConfigChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_133',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.CONFIG_CHANGED);
      expect(result.userId).toBe('admin_1');
    });

    it('should process a security event', async () => {
      const event = {
        type: AuditEventType.SECURITY_EVENT,
        payload: {
          eventType: 'brute_force',
          severity: 'high',
          userId: 'user_999',
          sessionId: 'session_999',
          ipAddress: '192.168.1.100',
          userAgent: 'curl/7.68.0',
          details: { attempts: 10, timeWindow: 300 },
          detectedAt: Date.now(),
          source: 'waf',
          mitigated: true,
          mitigationActions: ['ip_blocked', 'account_locked'],
        } as SecurityEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_134',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.SECURITY_EVENT);
      expect(result.userId).toBe('user_999');
      expect(result.ipAddress).toBe('192.168.1.100');
      expect(result.severity).toBe('high');
    });

    it('should process a compliance check event', async () => {
      const event = {
        type: AuditEventType.COMPLIANCE_CHECK,
        payload: {
          framework: 'gdpr',
          checkId: 'check_123',
          checkName: 'Data Retention Policy',
          status: 'passed',
          resourceId: 'user_database',
          resourceType: 'database',
          details: { retentionDays: 365 },
          evidence: { policyDoc: 'doc_123' },
          remediation: '',
          checkedAt: Date.now(),
          checkedBy: 'compliance_officer',
        } as ComplianceCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_135',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.COMPLIANCE_CHECK);
      expect(result.userId).toBe('compliance_officer');
    });

    it('should process a session started event', async () => {
      const event = {
        type: AuditEventType.SESSION_STARTED,
        payload: {
          sessionId: 'session_abc',
          userId: 'user_111',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          authMethod: 'password',
          mfaUsed: true,
          deviceFingerprint: 'fp_123',
          location: { country: 'US', region: 'CA', city: 'San Francisco' },
        } as SessionPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_136',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.SESSION_STARTED);
      expect(result.userId).toBe('user_111');
      expect(result.sessionId).toBe('session_abc');
      expect(result.ipAddress).toBe('192.168.1.1');
    });

    it('should process a login success event', async () => {
      const event = {
        type: AuditEventType.LOGIN_SUCCESS,
        payload: {
          userId: 'user_111',
          sessionId: 'session_abc',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          authMethod: 'password',
          mfaUsed: true,
          deviceFingerprint: 'fp_123',
          location: { country: 'US', region: 'CA', city: 'San Francisco' },
        } as LoginPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_137',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.LOGIN_SUCCESS);
      expect(result.userId).toBe('user_111');
      expect(result.sessionId).toBe('session_abc');
    });

    it('should process a login failed event', async () => {
      const event = {
        type: AuditEventType.LOGIN_FAILED,
        payload: {
          userId: 'user_111',
          sessionId: 'session_abc',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          authMethod: 'password',
          mfaUsed: false,
          deviceFingerprint: 'fp_123',
          location: { country: 'US', region: 'CA', city: 'San Francisco' },
          failureReason: 'invalid_credentials',
        } as LoginPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_138',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.LOGIN_FAILED);
      expect(result.userId).toBe('user_111');
    });

    it('should process a logout event', async () => {
      const event = {
        type: AuditEventType.LOGOUT,
        payload: {
          userId: 'user_111',
          sessionId: 'session_abc',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          reason: 'user_initiated',
          sessionDurationMs: 3600000,
        } as LogoutPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_139',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.LOGOUT);
      expect(result.userId).toBe('user_111');
      expect(result.sessionId).toBe('session_abc');
    });

    it('should process a password changed event', async () => {
      const event = {
        type: AuditEventType.PASSWORD_CHANGED,
        payload: {
          userId: 'user_111',
          credentialType: 'password',
          operation: 'changed',
          changedBy: 'user_111',
          sessionId: 'session_abc',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          reason: 'routine_rotation',
        } as CredentialChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_140',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.PASSWORD_CHANGED);
      expect(result.userId).toBe('user_111');
    });

    it('should process an API key created event', async () => {
      const event = {
        type: AuditEventType.API_KEY_CREATED,
        payload: {
          keyId: 'key_123',
          keyName: 'CI/CD Key',
          userId: 'user_111',
          operation: 'created',
          scopes: ['read', 'write'],
          expiresAt: Date.now() + 31536000000,
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as ApiKeyPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_141',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuditEventType.API_KEY_CREATED);
      expect(result.userId).toBe('user_111');
    });

    it('should reject disallowed event types', async () => {
      const restrictedProcessor = new AuditEventProcessor({
        allowedEventTypes: [AuditEventType.ACCESS_GRANTED],
      });

      const event = {
        type: AuditEventType.SECURITY_EVENT,
        payload: {
          eventType: 'brute_force',
          severity: 'high',
          details: {},
          detectedAt: Date.now(),
          source: 'waf',
        } as SecurityEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_142',
      };

      await expect(restrictedProcessor.processEvent(event)).rejects.toThrow('Event type not allowed');
    });

    it('should sanitize PII fields', async () => {
      const event = {
        type: AuditEventType.ACCESS_GRANTED,
        payload: {
          resourceId: 'resource_123',
          resourceType: 'document',
          action: 'read',
          userId: 'user_456',
          sessionId: 'session_789',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          password: 'secret_password',
          api_key: 'sk_live_abc123',
        } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_143',
      };

      const result = await processor.processEvent(event);
      expect(result.payload.password).toBe('[REDACTED]');
      expect(result.payload.api_key).toBe('[REDACTED]');
    });
  });

  describe('processBatch', () => {
    it('should process multiple events', async () => {
      const events = [
        {
          type: AuditEventType.ACCESS_GRANTED,
          payload: { resourceId: 'r1', resourceType: 'doc', action: 'read', userId: 'u1' } as AccessGrantedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_1',
        },
        {
          type: AuditEventType.ACCESS_DENIED,
          payload: { resourceId: 'r2', resourceType: 'doc', action: 'write', userId: 'u2', reason: 'insufficient_permissions', attemptedAt: Date.now() } as AccessDeniedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_2',
        },
        {
          type: AuditEventType.RESOURCE_CREATED,
          payload: { resourceId: 'r3', resourceType: 'user', operation: 'created', userId: 'u3' } as ResourceChangedPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_3',
        },
      ];

      const results = await processor.processBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.enriched)).toBe(true);
    });
  });

  describe('metrics', () => {
    it('should track access metrics', async () => {
      await processor.processEvent({
        type: AuditEventType.ACCESS_GRANTED,
        payload: { resourceId: 'r1', resourceType: 'doc', action: 'read', userId: 'u1' } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuditEventType.ACCESS_DENIED,
        payload: { resourceId: 'r1', resourceType: 'doc', action: 'write', userId: 'u2', reason: 'insufficient_permissions', attemptedAt: Date.now() } as AccessDeniedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getAccessMetrics('doc:r1');
      expect(metrics).toBeDefined();
      expect(metrics?.grantedCount).toBe(1);
      expect(metrics?.deniedCount).toBe(1);
      expect(metrics?.uniqueUsers.size).toBe(2);
    });

    it('should track resource metrics', async () => {
      await processor.processEvent({
        type: AuditEventType.RESOURCE_CREATED,
        payload: { resourceId: 'r1', resourceType: 'user', operation: 'created', userId: 'u1' } as ResourceChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuditEventType.RESOURCE_UPDATED,
        payload: { resourceId: 'r1', resourceType: 'user', operation: 'updated', userId: 'u1' } as ResourceChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getResourceMetrics('user:r1');
      expect(metrics).toBeDefined();
      expect(metrics?.createdCount).toBe(1);
      expect(metrics?.updatedCount).toBe(1);
    });

    it('should track user activity metrics', async () => {
      await processor.processEvent({
        type: AuditEventType.LOGIN_SUCCESS,
        payload: { userId: 'u1', sessionId: 's1', ipAddress: '1.1.1.1', userAgent: 'test', authMethod: 'password', mfaUsed: true } as LoginPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuditEventType.ACCESS_GRANTED,
        payload: { resourceId: 'r1', resourceType: 'doc', action: 'read', userId: 'u1' } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getUserActivityMetrics('u1');
      expect(metrics).toBeDefined();
      expect(metrics?.loginCount).toBe(1);
      expect(metrics?.accessGrantedCount).toBe(1);
    });

    it('should track security metrics', async () => {
      await processor.processEvent({
        type: AuditEventType.SECURITY_EVENT,
        payload: { eventType: 'brute_force', severity: 'high', details: {}, detectedAt: Date.now(), source: 'waf' } as SecurityEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      const metrics = processor.getSecurityMetrics('brute_force:high');
      expect(metrics).toBeDefined();
      expect(metrics?.count).toBe(1);
      expect(metrics?.severity).toBe('high');
    });

    it('should track compliance metrics', async () => {
      await processor.processEvent({
        type: AuditEventType.COMPLIANCE_CHECK,
        payload: { framework: 'gdpr', checkId: 'c1', checkName: 'Test', status: 'passed', checkedAt: Date.now(), checkedBy: 'officer' } as ComplianceCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      const metrics = processor.getComplianceMetrics('gdpr');
      expect(metrics).toBeDefined();
      expect(metrics?.passedCount).toBe(1);
    });

    it('should track event counts', async () => {
      await processor.processEvent({
        type: AuditEventType.ACCESS_GRANTED,
        payload: { resourceId: 'r1', resourceType: 'doc', action: 'read', userId: 'u1' } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuditEventType.ACCESS_DENIED,
        payload: { resourceId: 'r2', resourceType: 'doc', action: 'write', userId: 'u2', reason: 'insufficient_permissions', attemptedAt: Date.now() } as AccessDeniedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const counts = processor.getEventCounts();
      expect(counts[AuditEventType.ACCESS_GRANTED]).toBe(1);
      expect(counts[AuditEventType.ACCESS_DENIED]).toBe(1);
    });

    it('should track average processing time', async () => {
      await processor.processEvent({
        type: AuditEventType.ACCESS_GRANTED,
        payload: { resourceId: 'r1', resourceType: 'doc', action: 'read', userId: 'u1' } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      const avgTime = processor.getAverageProcessingTime();
      expect(avgTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('adapters', () => {
    it('should route events to registered adapters', async () => {
      const event = {
        type: AuditEventType.ACCESS_GRANTED,
        payload: { resourceId: 'r1', resourceType: 'doc', action: 'read', userId: 'u1' } as AccessGrantedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      };

      await processor.processEvent(event);

      const status = adapter.getStatus();
      expect(status.entryCount).toBe(1);
    });

    it('should track adapter status', () => {
      const status = processor.getAdapterStatus();
      expect(status.file).toBeDefined();
      expect(status.file.adapter).toBe('file');
    });
  });
});