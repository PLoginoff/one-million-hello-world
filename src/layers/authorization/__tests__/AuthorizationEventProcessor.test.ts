/**
 * Authorization Event Processor Tests
 */

import { AuthorizationEventProcessor } from '../domain/handlers/AuthorizationEventProcessor';
import { AuthorizationInMemoryAdapter } from '../adapters/InMemoryAdapter';
import {
  AuthorizationEventType,
  PermissionCheckPayload,
  PermissionResultPayload,
  RoleChangedPayload,
  PolicyChangedPayload,
  ResourceAccessPayload,
  SubjectChangedPayload,
  DelegationPayload,
  ConditionEvaluatedPayload,
  CacheEventPayload,
} from '../domain/events/AuthorizationEventTypes';

describe('AuthorizationEventProcessor', () => {
  let processor: AuthorizationEventProcessor;
  let adapter: AuthorizationInMemoryAdapter;

  beforeEach(() => {
    processor = new AuthorizationEventProcessor({
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
    });
    adapter = new AuthorizationInMemoryAdapter();
    processor.registerAdapter('inmemory', adapter);
  });

  afterEach(async () => {
    adapter.clearResponses();
  });

  describe('processEvent', () => {
    it('should process a permission check event', async () => {
      const event = {
        type: AuthorizationEventType.PERMISSION_CHECK,
        payload: {
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          resourceType: 'document',
          action: 'read',
          context: { department: 'engineering' },
          requestId: 'req_123',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
        } as PermissionCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_123',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.PERMISSION_CHECK);
      expect(result.subjectId).toBe('subject_123');
      expect(result.resourceId).toBe('resource_456');
      expect(result.resourceType).toBe('document');
      expect(result.action).toBe('read');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should process a permission granted event', async () => {
      const event = {
        type: AuthorizationEventType.PERMISSION_GRANTED,
        payload: {
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          resourceType: 'document',
          action: 'read',
          allowed: true,
          reason: 'policy_allow',
          matchedPolicies: ['policy_1', 'policy_2'],
          evaluationTimeMs: 5,
          requestId: 'req_123',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
        } as PermissionResultPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_124',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.PERMISSION_GRANTED);
      expect(result.subjectId).toBe('subject_123');
      expect(result.resourceId).toBe('resource_456');
      expect(result.allowed).toBe(true);
    });

    it('should process a permission denied event', async () => {
      const event = {
        type: AuthorizationEventType.PERMISSION_DENIED,
        payload: {
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          resourceType: 'document',
          action: 'delete',
          allowed: false,
          reason: 'insufficient_permissions',
          matchedPolicies: [],
          evaluationTimeMs: 3,
          requestId: 'req_124',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
        } as PermissionResultPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_125',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.PERMISSION_DENIED);
      expect(result.allowed).toBe(false);
    });

    it('should process a role assigned event', async () => {
      const event = {
        type: AuthorizationEventType.ROLE_ASSIGNED,
        payload: {
          subjectId: 'subject_123',
          roleId: 'role_editor',
          roleName: 'Editor',
          action: 'assigned',
          grantedBy: 'admin_1',
          sessionId: 'session_123',
          scope: 'project_123',
          expiresAt: Date.now() + 86400000,
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_126',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.ROLE_ASSIGNED);
      expect(result.subjectId).toBe('subject_123');
      expect(result.roleId).toBe('role_editor');
    });

    it('should process a role revoked event', async () => {
      const event = {
        type: AuthorizationEventType.ROLE_REVOKED,
        payload: {
          subjectId: 'subject_123',
          roleId: 'role_editor',
          roleName: 'Editor',
          action: 'revoked',
          grantedBy: 'admin_1',
          sessionId: 'session_123',
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_127',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.ROLE_REVOKED);
      expect(result.subjectId).toBe('subject_123');
      expect(result.roleId).toBe('role_editor');
    });

    it('should process a policy evaluated event', async () => {
      const event = {
        type: AuthorizationEventType.POLICY_EVALUATED,
        payload: {
          policyId: 'policy_123',
          policyName: 'Document Access Policy',
          operation: 'evaluated',
          changedBy: 'system',
          sessionId: 'session_123',
          rules: { document: { read: true, write: false } },
          effect: 'allow',
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as PolicyChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_128',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.POLICY_EVALUATED);
      expect(result.policyId).toBe('policy_123');
    });

    it('should process a resource access granted event', async () => {
      const event = {
        type: AuthorizationEventType.RESOURCE_ACCESS_GRANTED,
        payload: {
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          resourceType: 'document',
          action: 'read',
          context: { department: 'engineering' },
          requestId: 'req_123',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          allowed: true,
          reason: 'policy_allow',
          matchedPolicies: ['policy_1'],
        } as ResourceAccessPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_129',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.RESOURCE_ACCESS_GRANTED);
      expect(result.subjectId).toBe('subject_123');
      expect(result.resourceId).toBe('resource_456');
      expect(result.allowed).toBe(true);
    });

    it('should process a resource access denied event', async () => {
      const event = {
        type: AuthorizationEventType.RESOURCE_ACCESS_DENIED,
        payload: {
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          resourceType: 'document',
          action: 'delete',
          context: { department: 'engineering' },
          requestId: 'req_124',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          allowed: false,
          reason: 'insufficient_permissions',
          matchedPolicies: [],
        } as ResourceAccessPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_130',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.RESOURCE_ACCESS_DENIED);
      expect(result.allowed).toBe(false);
    });

    it('should process a subject created event', async () => {
      const event = {
        type: AuthorizationEventType.SUBJECT_CREATED,
        payload: {
          subjectId: 'subject_999',
          subjectType: 'user',
          operation: 'created',
          changedBy: 'admin_1',
          sessionId: 'session_123',
          attributes: { email: 'user@example.com', department: 'engineering' },
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as SubjectChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_131',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.SUBJECT_CREATED);
      expect(result.subjectId).toBe('subject_999');
    });

    it('should process a delegation granted event', async () => {
      const event = {
        type: AuthorizationEventType.DELEGATION_GRANTED,
        payload: {
          delegatorId: 'subject_111',
          delegateeId: 'subject_222',
          resourceId: 'resource_456',
          resourceType: 'document',
          actions: ['read', 'write'],
          action: 'granted',
          grantedBy: 'admin_1',
          sessionId: 'session_123',
          expiresAt: Date.now() + 86400000,
          constraints: { maxUses: 10 },
          ipAddress: '10.0.0.1',
          userAgent: 'admin-panel',
        } as DelegationPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_132',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.DELEGATION_GRANTED);
      expect(result.subjectId).toBe('subject_111');
      expect(result.resourceId).toBe('resource_456');
    });

    it('should process a condition evaluated event', async () => {
      const event = {
        type: AuthorizationEventType.CONDITION_EVALUATED,
        payload: {
          conditionId: 'condition_123',
          conditionType: 'time',
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          action: 'read',
          result: true,
          evaluationTimeMs: 2,
          context: { currentTime: Date.now(), allowedHours: '9-17' },
        } as ConditionEvaluatedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_133',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.CONDITION_EVALUATED);
      expect(result.subjectId).toBe('subject_123');
      expect(result.resourceId).toBe('resource_456');
      expect(result.action).toBe('read');
    });

    it('should process a cache hit event', async () => {
      const event = {
        type: AuthorizationEventType.CACHE_HIT,
        payload: {
          cacheKey: 'perm:subject_123:document:read',
          operation: 'hit',
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          action: 'read',
          ttl: 300,
          size: 256,
        } as CacheEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_134',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.CACHE_HIT);
    });

    it('should process a cache miss event', async () => {
      const event = {
        type: AuthorizationEventType.CACHE_MISS,
        payload: {
          cacheKey: 'perm:subject_999:document:write',
          operation: 'miss',
          subjectId: 'subject_999',
          resourceId: 'resource_789',
          action: 'write',
        } as CacheEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_135',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.CACHE_MISS);
    });

    it('should process a cache invalidated event', async () => {
      const event = {
        type: AuthorizationEventType.CACHE_INVALIDATED,
        payload: {
          cacheKey: 'perm:subject_123:document:read',
          operation: 'invalidate',
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          action: 'read',
        } as CacheEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_136',
      };

      const result = await processor.processEvent(event);

      expect(result.enriched).toBe(true);
      expect(result.type).toBe(AuthorizationEventType.CACHE_INVALIDATED);
    });

    it('should reject disallowed event types', async () => {
      const restrictedProcessor = new AuthorizationEventProcessor({
        allowedEventTypes: [AuthorizationEventType.PERMISSION_CHECK],
      });

      const event = {
        type: AuthorizationEventType.ROLE_ASSIGNED,
        payload: {
          subjectId: 'subject_123',
          roleId: 'role_editor',
          roleName: 'Editor',
          action: 'assigned',
          grantedBy: 'admin_1',
        } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_137',
      };

      await expect(restrictedProcessor.processEvent(event)).rejects.toThrow('Event type not allowed');
    });

    it('should sanitize PII fields', async () => {
      const event = {
        type: AuthorizationEventType.PERMISSION_CHECK,
        payload: {
          subjectId: 'subject_123',
          resourceId: 'resource_456',
          resourceType: 'document',
          action: 'read',
          context: { password: 'secret_password', api_key: 'sk_live_abc123' },
        } as PermissionCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_138',
      };

      const result = await processor.processEvent(event);
      expect(result.payload.context.password).toBe('[REDACTED]');
      expect(result.payload.context.api_key).toBe('[REDACTED]');
    });
  });

  describe('processBatch', () => {
    it('should process multiple events', async () => {
      const events = [
        {
          type: AuthorizationEventType.PERMISSION_CHECK,
          payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read' } as PermissionCheckPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_1',
        },
        {
          type: AuthorizationEventType.PERMISSION_GRANTED,
          payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read', allowed: true } as PermissionResultPayload,
          timestamp: Date.now(),
          source: 'test',
          eventId: 'evt_2',
        },
        {
          type: AuthorizationEventType.ROLE_ASSIGNED,
          payload: { subjectId: 's2', roleId: 'role_1', roleName: 'Role1', action: 'assigned', grantedBy: 'admin' } as RoleChangedPayload,
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
    it('should track permission metrics', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_CHECK,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read' } as PermissionCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_GRANTED,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read', allowed: true } as PermissionResultPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_DENIED,
        payload: { subjectId: 's2', resourceId: 'r2', resourceType: 'doc', action: 'write', allowed: false } as PermissionResultPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_3',
      });

      const metrics = processor.getPermissionMetrics('read', 'doc');
      expect(metrics).toBeDefined();
      expect(metrics?.totalChecks).toBe(2);
      expect(metrics?.grantedCount).toBe(1);
      expect(metrics?.deniedCount).toBe(0);
      expect(metrics?.uniqueSubjects.size).toBe(1);
    });

    it('should track role metrics', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.ROLE_ASSIGNED,
        payload: { subjectId: 's1', roleId: 'role_1', roleName: 'Role1', action: 'assigned', grantedBy: 'admin' } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.ROLE_REVOKED,
        payload: { subjectId: 's2', roleId: 'role_1', roleName: 'Role1', action: 'revoked', grantedBy: 'admin' } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getRoleMetrics('role_1');
      expect(metrics).toBeDefined();
      expect(metrics?.assignedCount).toBe(1);
      expect(metrics?.revokedCount).toBe(1);
      expect(metrics?.uniqueSubjects.size).toBe(2);
    });

    it('should track policy metrics', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.POLICY_EVALUATED,
        payload: { policyId: 'p1', policyName: 'Policy1', operation: 'evaluated', changedBy: 'system', effect: 'allow' } as PolicyChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.POLICY_EVALUATED,
        payload: { policyId: 'p1', policyName: 'Policy1', operation: 'evaluated', changedBy: 'system', effect: 'deny' } as PolicyChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getPolicyMetrics('p1');
      expect(metrics).toBeDefined();
      expect(metrics?.evaluations).toBe(2);
      expect(metrics?.allowCount).toBe(1);
      expect(metrics?.denyCount).toBe(1);
    });

    it('should track resource metrics', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.RESOURCE_ACCESS_GRANTED,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read', allowed: true } as ResourceAccessPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.RESOURCE_ACCESS_DENIED,
        payload: { subjectId: 's2', resourceId: 'r1', resourceType: 'doc', action: 'write', allowed: false } as ResourceAccessPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getResourceMetrics('r1', 'doc');
      expect(metrics).toBeDefined();
      expect(metrics?.accessRequests).toBe(2);
      expect(metrics?.grantedCount).toBe(1);
      expect(metrics?.deniedCount).toBe(1);
    });

    it('should track subject metrics', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_GRANTED,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read', allowed: true } as PermissionResultPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.ROLE_ASSIGNED,
        payload: { subjectId: 's1', roleId: 'role_1', roleName: 'Role1', action: 'assigned', grantedBy: 'admin' } as RoleChangedPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getSubjectMetrics('s1');
      expect(metrics).toBeDefined();
      expect(metrics?.permissionChecks).toBe(2);
      expect(metrics?.rolesAssigned).toBe(1);
    });

    it('should track cache metrics', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.CACHE_HIT,
        payload: { cacheKey: 'key1', operation: 'hit', subjectId: 's1', resourceId: 'r1', action: 'read' } as CacheEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.CACHE_MISS,
        payload: { cacheKey: 'key2', operation: 'miss', subjectId: 's2', resourceId: 'r2', action: 'write' } as CacheEventPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const metrics = processor.getCacheMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.hitRate).toBe(0.5);
    });

    it('should track event counts', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_CHECK,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read' } as PermissionCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      });

      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_GRANTED,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read', allowed: true } as PermissionResultPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_2',
      });

      const counts = processor.getEventCounts();
      expect(counts[AuthorizationEventType.PERMISSION_CHECK]).toBe(2);
      expect(counts[AuthorizationEventType.PERMISSION_GRANTED]).toBe(2);
    });

    it('should track average processing time', async () => {
      await processor.processEvent({
        type: AuthorizationEventType.PERMISSION_CHECK,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read' } as PermissionCheckPayload,
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
        type: AuthorizationEventType.PERMISSION_CHECK,
        payload: { subjectId: 's1', resourceId: 'r1', resourceType: 'doc', action: 'read' } as PermissionCheckPayload,
        timestamp: Date.now(),
        source: 'test',
        eventId: 'evt_1',
      };

      await processor.processEvent(event);

      const status = adapter.getStatus();
      expect(status.executionCount).toBe(1);
    });

    it('should track adapter status', () => {
      const status = processor.getAdapterStatus();
      expect(status.inmemory).toBeDefined();
      expect(status.inmemory.adapter).toBe('inmemory');
    });
  });
});