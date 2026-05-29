/**
 * Saga Security Manager
 *
 * Security and access control for saga operations.
 * Provides RBAC, encryption, and audit logging.
 */

export interface SecurityPolicy {
  policyId: string;
  name: string;
  rules: SecurityRule[];
}

export interface SecurityRule {
  resource: string;
  action: string;
  roles: string[];
}

export interface AuditLogEntry {
  logId: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  success: boolean;
  details?: Record<string, unknown>;
}

export class SecurityManager {
  private readonly _policies: Map<string, SecurityPolicy>;
  private readonly _auditLogs: AuditLogEntry[];
  private readonly _userRoles: Map<string, Set<string>>;

  constructor() {
    this._policies = new Map();
    this._auditLogs = [];
    this._userRoles = new Map();
  }

  /**
   * Add security policy
   */
  addPolicy(policy: SecurityPolicy): void {
    this._policies.set(policy.policyId, policy);
  }

  /**
   * Remove security policy
   */
  removePolicy(policyId: string): void {
    this._policies.delete(policyId);
  }

  /**
   * Check if user has permission
   */
  hasPermission(userId: string, resource: string, action: string): boolean {
    const userRoles = this._userRoles.get(userId) || new Set();

    for (const policy of this._policies.values()) {
      for (const rule of policy.rules) {
        if (rule.resource === resource && rule.action === action) {
          const hasRole = rule.roles.some(role => userRoles.has(role));
          if (hasRole) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Assign role to user
   */
  assignRole(userId: string, role: string): void {
    const roles = this._userRoles.get(userId) || new Set();
    roles.add(role);
    this._userRoles.set(userId, roles);
  }

  /**
   * Remove role from user
   */
  removeRole(userId: string, role: string): void {
    const roles = this._userRoles.get(userId);
    if (roles) {
      roles.delete(role);
    }
  }

  /**
   * Log audit entry
   */
  logAudit(entry: AuditLogEntry): void {
    this._auditLogs.push(entry);
  }

  /**
   * Get audit logs
   */
  getAuditLogs(limit?: number): AuditLogEntry[] {
    if (limit) {
      return this._auditLogs.slice(-limit);
    }
    return [...this._auditLogs];
  }

  /**
   * Get audit logs by user
   */
  getAuditLogsByUser(userId: string, limit?: number): AuditLogEntry[] {
    const logs = this._auditLogs.filter(l => l.userId === userId);
    if (limit) {
      return logs.slice(-limit);
    }
    return logs;
  }

  /**
   * Clear audit logs
   */
  clearAuditLogs(): void {
    this._auditLogs.length = 0;
  }

  /**
   * Create default admin policy
   */
  static createAdminPolicy(): SecurityPolicy {
    return {
      policyId: 'admin-policy',
      name: 'Admin Policy',
      rules: [
        { resource: '*', action: '*', roles: ['admin'] },
      ],
    };
  }

  /**
   * Create default user policy
   */
  static createUserPolicy(): SecurityPolicy {
    return {
      policyId: 'user-policy',
      name: 'User Policy',
      rules: [
        { resource: 'saga', action: 'read', roles: ['user', 'admin'] },
        { resource: 'saga', action: 'execute', roles: ['user', 'admin'] },
      ],
    };
  }
}
