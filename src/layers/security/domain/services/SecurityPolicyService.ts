/**
 * Security Policy Service
 * 
 * Provides policy evaluation and enforcement logic.
 */

import { SecurityContextEntity } from '../entities/SecurityContextEntity';
import { PolicyEntity } from '../entities/PolicyEntity';

export class SecurityPolicyService {
  /**
   * Evaluate if context is allowed to perform action on resource
   */
  static evaluatePolicies(
    context: SecurityContextEntity,
    policies: PolicyEntity[],
    resource: string,
    action: string
  ): {
    allowed: boolean;
    matchedPolicy?: PolicyEntity;
    reason: string;
  } {
    const enabledPolicies = policies.filter(p => p.isEnabled());
    const sortedPolicies = enabledPolicies.sort((a, b) => b.data.priority - a.data.priority);

    for (const policy of sortedPolicies) {
      if (!policy.appliesTo(resource, action)) {
        continue;
      }

      if (policy.isDenied(resource, action)) {
        return {
          allowed: false,
          matchedPolicy: policy,
          reason: `Denied by policy: ${policy.data.name}`,
        };
      }

      if (policy.isAllowed(resource, action)) {
        return {
          allowed: true,
          matchedPolicy: policy,
          reason: `Allowed by policy: ${policy.data.name}`,
        };
      }
    }

    return {
      allowed: true,
      reason: 'No matching policy found, default allow',
    };
  }

  /**
   * Check if context has required security level
   */
  static checkSecurityLevel(
    context: SecurityContextEntity,
    requiredLevel: string
  ): boolean {
    const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const contextLevelIndex = levels.indexOf(context.data.securityLevel);
    const requiredLevelIndex = levels.indexOf(requiredLevel);
    return contextLevelIndex >= requiredLevelIndex;
  }

  /**
   * Get all policies applicable to resource
   */
  static getApplicablePolicies(
    policies: PolicyEntity[],
    resource: string
  ): PolicyEntity[] {
    return policies.filter(
      policy => policy.isEnabled() && policy.data.rules.some(rule => rule.resource === resource)
    );
  }

  /**
   * Get all policies that deny access to resource
   */
  static getDenyingPolicies(
    policies: PolicyEntity[],
    resource: string,
    action: string
  ): PolicyEntity[] {
    return policies.filter(
      policy => policy.isEnabled() && policy.isDenied(resource, action)
    );
  }

  /**
   * Get all policies that allow access to resource
   */
  static getAllowingPolicies(
    policies: PolicyEntity[],
    resource: string,
    action: string
  ): PolicyEntity[] {
    return policies.filter(
      policy => policy.isEnabled() && policy.isAllowed(resource, action)
    );
  }
}
